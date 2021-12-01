/***************************************
 * Title: LDESinSolid
 * Description: class for LDES in Solid
 * Author: Wout Slabbinck (wout.slabbinck@ugent.be)
 * Created on 29/11/2021
 *****************************************/
import {Session} from "@inrupt/solid-client-authn-node";
import {DataFactory, Store, Writer} from "n3";
import rdfParser from 'rdf-parse';
import {createAclContent} from "./util/Acl";
import {addRelation, createEventStream} from "./util/EventStream";
import {Acl} from "./util/Interfaces";
import {ACL, LDP, TREE} from "./util/Vocabularies";

const {namedNode, literal} = DataFactory;

const parse = require('parse-link-header');
const storeStream = require("rdf-store-stream").storeStream;
const streamify = require('streamify-string');

export class LDESinSolid {
  private readonly _session: Session;
  private readonly _root: string;
  private readonly _containerAmount: number;
  private _shapeIRI: string | undefined;

  constructor(session: Session, root: string)
  constructor(session: Session, root: string, amount: number);
  constructor(session: Session, root: string, amount?: number) {
    this._session = session;
    this._root = root;
    if (amount) {
      this._containerAmount = amount;
    } else {
      this._containerAmount = 100;
    }
    this.isLoggedIn();
    // maybe check if valid root? (can't do that in constructor)
  }

  get root(): string {
    return this._root;
  }

  get containerAmount(): number {
    return this._containerAmount;
  }

  get shapeIRI(): string {
    if (!this._shapeIRI) throw  Error("You should have initialised.");
    return this._shapeIRI;
  }

  get session(): Session {
    return this._session;
  }

  public async init(): Promise<void> {
    await this.getShape();
  }

  // TODO: use collection
  private async getShape(): Promise<void> {
    const currentContainerIRI = await this.getCurrentContainer();
    const headResponse = await this._session.fetch(currentContainerIRI,
      {method: 'HEAD'});
    const linkHeaders = parse(headResponse.headers.get('link'));
    if (!linkHeaders) {
      throw new Error(`No Link Header present when fetching: ${currentContainerIRI}`);
    }
    const shapeLink = linkHeaders[LDP.constrainedBy];
    if (!shapeLink) {
      throw new Error('No http://www.w3.org/ns/ldp#constrainedBy Link Header present.');
    }
    this._shapeIRI = shapeLink.url;
  }

  public async getCurrentContainer(): Promise<string> {
    this.isLoggedIn();

    const headResponse = await this._session.fetch(this._root,
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

    const response = await this._session.fetch(iri);
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
    if (!this._session.info.isLoggedIn) {
      throw Error("Not logged in a Solid Session.");
    }
  }

  public async createContainer(newContainerName: string): Promise<Response> {
    this.isLoggedIn();

    const response = await this._session.fetch(`${this._root + newContainerName}/`, {
      method: "PUT",
      headers: {
        Link: '<http://www.w3.org/ns/ldp#Container>; rel="type"',
        "Content-Type": 'text/turtle'
      }
    });
    return response;
  }

  public async addShape(newContainerName: string): Promise<Response> {
    this.isLoggedIn();

    // add constraint to new container
    const newContainerIRI = `${this._root + newContainerName}/`;
    const response = await this._session.fetch(newContainerIRI, {
      method: "PUT",
      headers: {
        Link: `<${this.shapeIRI}>; rel="${LDP.constrainedBy}"`,
        "Content-Type": 'text/turtle'
      }
    });
    return response;
  }

  public async updateAcl(aclIRI: string, aclBody: Acl[]): Promise<Response> {
    this.isLoggedIn();

    const response = await this._session.fetch(aclIRI, {
      method: "PUT",
      headers: {
        'Content-Type': 'application/ld+json',
        Link: '<http://www.w3.org/ns/ldp#Resource>; rel="type"'
      },
      body: JSON.stringify(aclBody)
    });
    return response;
  }

  /**
     *
     * @param newContainerName
     * @returns {Promise<Response>}
     */
  public async updateInbox(newContainerName: string): Promise<Response> {
    this.isLoggedIn();
    const response = await this._session.fetch(this._root, {
      method: "PUT",
      headers: {
        Link: `<${this._root + newContainerName}/>; rel="${LDP.inbox}"`,
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
  public async addRelation(newContainerName: string): Promise<Response> {
    this.isLoggedIn();

    const rootIRI = `${this.root}root.ttl`;
    const ldesRootStore = await this.fetchStore(rootIRI);

    // get tree:path from earlier relations
    const treePaths = ldesRootStore.getQuads(null, TREE.path, null, null);
    if (treePaths.length === 0) {
      throw Error('No tree path present in the current relations');
    }
    const treePath = treePaths[0].object;

    addRelation(ldesRootStore, treePath.id, TREE.GreaterThanOrEqualToRelation, newContainerName, this.root);

    const writer = new Writer();
    const text = writer.quadsToString(ldesRootStore.getQuads(null, null, null, null));
    const response = await this._session.fetch(rootIRI, {
      method: 'PUT',
      headers: {
        "Content-Type": 'text/turtle'
      },
      body: text
    });
    return response;
  }

  public async createLDES(shape: string, agent: string, treePath: string): Promise<void> {
    this.isLoggedIn();
    this._shapeIRI = shape;

    // create rootcontainer
    const createRootResponse = await this.session.fetch(this.root, {
      method: "PUT",
      headers: {
        Link: '<http://www.w3.org/ns/ldp#Container>; rel="type"',
        "Content-Type": 'text/turtle'
      }
    });
    if (createRootResponse.status !== 201) {
      if (createRootResponse.status === 205){
        throw Error(`Root "${this.root}" already exists | status code: ${createRootResponse.status}`);
      }
      throw Error(`Root "${this.root}" was not created | status code: ${createRootResponse.status}`);
    }
    console.log(`LDP container created: ${createRootResponse.url}`);

    const newContainerName = new Date().getTime().toString();

    // create first container
    const newContainerResponse = await this.createContainer(newContainerName);
    if (newContainerResponse.status !== 201) {
      throw Error(`New Container "${newContainerName}" was not created on ${this.root} | status code: ${newContainerResponse.status}`);
    }
    console.log(`LDP container (${newContainerName}) created for the first ${this.containerAmount} members of the LDES  at url: ${newContainerResponse.url}`);

    // add shape triple to container .meta
    const addShapeResponse = await this.addShape(newContainerName);
    if (addShapeResponse.status !== 205) {
      throw Error(`Adding the shape to the new container was not successful | status code: ${addShapeResponse.status}`);
    }
    console.log(`Shape validation added to ${addShapeResponse.url}`);

    // change inbox header in root container .meta
    const updateInboxResponse = await this.updateInbox(newContainerName);
    if (updateInboxResponse.status !== 205) {
      throw Error(`Updating the inbox was not successful | Status code: ${updateInboxResponse.status}`);
    }
    console.log(`${updateInboxResponse.url} is now the inbox of the LDES.`);

    // create acl file for first container to read + append
    const newContainerIRI = `${this.root + newContainerName}/`;
    const orchestratorAcl = createAclContent('orchestrator', [ACL.Read, ACL.Write, ACL.Control], agent);
    const aclReadAppend = createAclContent('#authorization', [ACL.Read, ACL.Append]);
    const newAclResponse = await this.updateAcl(`${newContainerIRI}.acl`, [aclReadAppend, orchestratorAcl]);
    if (newAclResponse.status !== 201) {
      throw Error(`Creating the ACL file for ${newContainerIRI} was not successful | Status code: ${newAclResponse.status}`);
    }
    console.log(`ACL file of ${newContainerIRI} created as READ and APPEND ONLY; writing to the inbox is now possible.`);

    // create root.ttl
    const eventStream = await createEventStream(this.shapeIRI, treePath, newContainerName, this.root);
    const writer = new Writer();
    const rootText = writer.quadsToString(eventStream.getQuads(null, null, null, null));
    const postRootResponse = await this.session.fetch(this.root, {
      method: "POST",
      headers: {
        "Content-Type": 'text/turtle',
        Link: '<http://www.w3.org/ns/ldp#Resource>; rel="type"',
        slug: 'root.ttl'
      },
      body: rootText
    });
    if (postRootResponse.status !== 201) {
      throw Error(`Creating root.ttl was not successful | Status code: ${postRootResponse.status}`);
    }
    console.log(`${postRootResponse.url} is the EventStream and view of the LDES in LDP.`);
  }
}
