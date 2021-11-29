/***************************************
 * Title: LDESinSolid
 * Description: class for LDES in Solid
 * Author: Wout Slabbinck (wout.slabbinck@ugent.be)
 * Created on 29/11/2021
 *****************************************/
import {Session} from "@inrupt/solid-client-authn-node";
import {URI} from '@treecg/tree-metadata-extraction/src/util/Util';
import {DataFactory, Store, Writer} from "n3";
import rdfParser from 'rdf-parse';
import {ACL, FOAF, LDP, RDF, TREE, XSD} from "./util/Vocabularies";


const {namedNode, literal} = DataFactory;

const parse = require('parse-link-header');
const storeStream = require("rdf-store-stream").storeStream;
const streamify = require('streamify-string');

export interface Acl {
    '@context'?: string | object;
    '@id': string;
    '@type': string[];
    mode: URI[];
    accessTo: URI;
    default: URI;
    agent?: URI;
    agentClass?: URI;
}

export class LDESinSolid {
  private session: Session;
  private readonly root: string;
  private readonly containerAmount: number;
  private shapeIRI: string | undefined;

  constructor(session: Session, root: string)
  constructor(session: Session, root: string, amount: number);
  constructor(session: Session, root: string, amount?: number) {
    this.session = session;
    this.root = root;
    if (amount) {
      this.containerAmount = amount;
    } else {
      this.containerAmount = 100;
    }
    this.isLoggedIn();
    // maybe check if valid root?
  }

  public async orchestrate(): Promise<string> {
    const currentAmount = await this.getAmountResources();
    if (currentAmount < this.containerAmount) {
      return 'No need for orchestrating as current amount of resources is ok.';
    }
    console.log(`Current amount of resources (${currentAmount}) is greater or equal than the maximum amount of resources per container (${this.containerAmount}).
    Creating new container as inbox has started:`);
    const newContainerName = new Date().getTime().toString();

    // get shape IRI and put in class vars
    await this.getShape();

    // create container
    const newContainerResponse = await this.createContainer(newContainerName);
    if (newContainerResponse.status !== 201) {
      throw Error(`New Container "${newContainerName}" was not created on ${this.root} | status code: ${newContainerResponse.status}`);
    }
    console.log('Container created');

    // temp remove shape validation on old container
    // TODO: remove these lines after updating CSS as the shape validation must stay there
    const container = await this.getCurrentContainer();
    const resp = await this.session.fetch(container, {
      method: "PUT",
      headers: {
        "Content-Type": 'text/turtle'
      }
    });
    if (resp.status !== 205) {
      console.log(await resp.text());
      throw Error("for some reason I could not delete shape triple");
    }

    // update acl of old container to only read
    const oldContainer = await this.getCurrentContainer();
    const orchestratorAcl = this.createAclContent('orchestrator', [ACL.Read, ACL.Write, ACL.Control], false);
    const aclReadStore = this.createAclContent('#authorization', [ACL.Read], true);
    const oldAclResponse = await this.updateAcl(`${oldContainer}.acl`, [aclReadStore, orchestratorAcl]);
    if (oldAclResponse.status !== 205) {
      throw Error(`Updating the ACL file of ${oldContainer} was not successful | Status code: ${oldAclResponse.status}`);
    }
    console.log(`ACL file of ${oldContainer} updated to READ ONLY.`);


    // create acl file for new container to read + append
    const newContainerIRI = `${this.root + newContainerName}/`;
    const aclReadAppend = this.createAclContent('#authorization', [ACL.Read, ACL.Append], true);
    const newAclResponse = await this.updateAcl(`${newContainerIRI}.acl`, [aclReadAppend, orchestratorAcl]);
    if (newAclResponse.status !== 201) {
      throw Error(`Creating the ACL file for ${newContainerIRI} was not successful | Status code: ${newAclResponse.status}`);
    }
    console.log(`ACL file of ${newContainerIRI} created as READ and APPEND ONLY; writing to the inbox is now possible.`);

    // add shape triple to container .meta
    // TODO: after shapevalidation update in CSS -> move after creating container
    const addShapeResponse = await this.addShape(newContainerName);
    if (addShapeResponse.status !== 205) {
      throw Error(`Adding the shape to the new container was not successful | status code: ${addShapeResponse.status}`);
    }
    console.log(`Shape validation added to ${this.root + newContainerName}/`);

    // change inbox header in root container .meta
    // TODO: move together with adding shapevalidation
    const updateInboxResponse = await this.updateInbox(newContainerName);
    if (updateInboxResponse.status !== 205) {
      throw Error(`Updating the inbox was not successful | Status code: ${updateInboxResponse.status}`);
    }
    console.log(`${this.root + newContainerName}/ is now the inbox.`);

    // update relation in root.ttl
    const addRelationResponse = await this.addRelation(newContainerName);
    if (addRelationResponse.status !== 205) {
      throw Error(`Updating the LDES root was not successful | Status code: ${addRelationResponse.status}`);
    }
    console.log(`${this.root}root.ttl is updated with a new relation to ${newContainerIRI}`);

    return `Orchestrating succeeded: new container can be found at ${this.root}${newContainerName}/`;
  }

  private async getShape(): Promise<void> {
    const currentContainerIRI = await this.getCurrentContainer();
    const headResponse = await this.session.fetch(currentContainerIRI,
      {method: 'HEAD'});
    const linkHeaders = parse(headResponse.headers.get('link'));
    if (!linkHeaders) {
      throw new Error(`No Link Header present when fetching: ${currentContainerIRI}`);
    }
    const shapeLink = linkHeaders[LDP.constrainedBy];
    if (!shapeLink) {
      throw new Error('No http://www.w3.org/ns/ldp#constrainedBy Link Header present.');
    }
    this.shapeIRI = shapeLink.url;
  }

  public async getCurrentContainer(): Promise<string> {
    this.isLoggedIn();

    const headResponse = await this.session.fetch(this.root,
      {method: 'HEAD'});
    const linkHeaders = parse(headResponse.headers.get('link'));
    if (!linkHeaders) {
      throw new Error('No Link Header present.');
    }
    const inboxLink = linkHeaders[LDP.inbox];
    if (!inboxLink) {
      throw new Error('No http://www.w3.org/ns/ldp#inbox Link Header present.');
    }
    return `${inboxLink.url}`;
  }

  public async getAmountResources(): Promise<number> {
    this.isLoggedIn();
    // Get current container used as inbox
    const currentContainerLocation = await this.getCurrentContainer();
    console.log(`Current container: ${currentContainerLocation}`);

    // get container and transform to store
    const store = await this.fetchStore(currentContainerLocation);

    const resources = store.getQuads(currentContainerLocation, LDP.contains, null, null);
    return resources.length;
  }

  /**
     * Fetches the iri and transforms the contents to a N3 Store
     * Note: currently only works for text/turle
     * @param iri
     * @returns {Promise<Store>}
     */
  private async fetchStore(iri: string): Promise<Store> {
    this.isLoggedIn();

    const response = await this.session.fetch(iri);
    if (response.status !== 200) {
      throw Error(`Fetching ${iri} to parse it into an N3 Store has failed.`);
    }
    const currentContainerText = await response.text();
    const textStream = streamify(currentContainerText);
    const quadStream = rdfParser.parse(textStream, {contentType: 'text/turtle', baseIRI: iri});
    const store = await storeStream(quadStream);
    return store;
  }

  private isLoggedIn(): void {
    if (!this.session.info.isLoggedIn) {
      throw Error("Not logged in a Solid Session.");
    }
  }

  private async createContainer(slug: string): Promise<Response> {
    this.isLoggedIn();

    const response = await this.session.fetch(`${this.root + slug}/`, {
      method: "PUT",
      headers: {
        Link: '<http://www.w3.org/ns/ldp#Container>; rel="type"',
        "Content-Type": 'text/turtle'
      }
    });
    return response;
  }

  /**
     *
     * @param slug
     * @returns {Promise<Response>}
     */
  private async updateInbox(slug: string): Promise<Response> {
    this.isLoggedIn();
    const response = await this.session.fetch(this.root, {
      method: "PUT",
      headers: {
        Link: `<${this.root + slug}/>; rel="${LDP.inbox}"`,
        "Content-Type": 'text/turtle'
      }
    });
    return response;
  }

  /**
     *
     * @param newContainerName
     * @returns {Promise<Response>}
     */
  private async addRelation(newContainerName: string): Promise<Response> {
    const rootIRI = `${this.root}root.ttl`;
    const newContainerIRI = `${this.root + newContainerName}/`;

    const ldesRootStore = await this.fetchStore(rootIRI);
    const relationNode = ldesRootStore.createBlankNode();

    const treePaths = ldesRootStore.getQuads(null, TREE.path, null, null);
    if (treePaths.length === 0) {
      throw Error('No tree path present in the current relations');
    }
    const treePath = treePaths[0].object;
    const dateTimeISO = new Date(Number(newContainerName)).toISOString();

    ldesRootStore.addQuad(namedNode(rootIRI), namedNode(TREE.relation), relationNode);

    ldesRootStore.addQuad(relationNode, namedNode(RDF.type), namedNode(TREE.GreaterThanOrEqualToRelation));
    ldesRootStore.addQuad(relationNode, namedNode(TREE.node), namedNode(newContainerIRI));
    ldesRootStore.addQuad(relationNode, namedNode(TREE.path), treePath);
    ldesRootStore.addQuad(relationNode, namedNode(TREE.value), literal(dateTimeISO, namedNode(XSD.dateTime)));

    const writer = new Writer();
    const text = writer.quadsToString(ldesRootStore.getQuads(null, null, null, null));
    const response = await this.session.fetch(rootIRI, {
      method: 'PUT',
      headers: {
        "Content-Type": 'text/turtle'
      },
      body: text
    });
    return response;
  }

  public async addShape(newContainerName: string): Promise<Response> {
    // add constraint to new container
    const newContainerIRI = `${this.root + newContainerName}/`;
    const response = await this.session.fetch(newContainerIRI, {
      method: "PUT",
      headers: {
        Link: `<${this.shapeIRI}>; rel="${LDP.constrainedBy}"`,
        "Content-Type": 'text/turtle'
      }
    });
    return response;
  }

  private async updateAcl(aclIRI: string, aclBody: Acl[]): Promise<Response> {
    const response = await this.session.fetch(aclIRI, {
      method: "PUT",
      headers: {
        'Content-Type': 'application/ld+json',
        Link: '<http://www.w3.org/ns/ldp#Resource>; rel="type"'
      },
      body: JSON.stringify(aclBody)
    });
    return response;
  }

  private createAclContent(id: string, modes: string[], everyone: boolean): Acl {
    const uriModes: URI[] = [];
    modes.forEach(mode => uriModes.push({"@id": mode}));

    const aclBody: Acl = {
      "@context": {'@vocab': ACL.namespace},
      "@id": id,
      "@type": [ACL.Authorization],
      accessTo: {'@id': './'},
      default: {'@id': './'},
      mode: uriModes
    };
    if (everyone) {
      aclBody['agentClass'] = {"@id": FOAF.Agent};
    } else {
      aclBody['agent'] = {"@id": 'https://pod.inrupt.com/woutslabbinck/profile/card#me'};//todo: has to be a group later
    }

    return aclBody;
  }
}
