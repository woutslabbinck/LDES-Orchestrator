/***************************************
 * Title: LDESinSolidv2
 * Description: class for LDES in Solid
 * Author: Wout Slabbinck (wout.slabbinck@ugent.be)
 * Created on 01/12/2021
 *****************************************/
import {Session} from "@inrupt/solid-client-authn-node";
import {Store, Writer} from "n3";
import rdfParser from "rdf-parse";
import {createAclContent} from "./util/Acl";
import {createEventStream} from "./util/EventStream";
import {Acl, ACLConfig, LDESConfig} from "./util/Interfaces";
import {ACL, LDP, RDF, TREE} from "./util/Vocabularies";

const parse = require('parse-link-header');
const storeStream = require("rdf-store-stream").storeStream;
const streamify = require('streamify-string');

export class LDESinSolid {
  private readonly _ldesConfig: LDESConfig;
  private readonly _aclConfig: ACLConfig;
  private readonly _session: Session;
  private readonly _amount: number;

  constructor(ldesConfig: LDESConfig, aclConfig: ACLConfig, session: Session)
  constructor(ldesConfig: LDESConfig, aclConfig: ACLConfig, session: Session, amount: number)
  constructor(ldesConfig: LDESConfig, aclConfig: ACLConfig, session: Session, amount?: number) {
    this._ldesConfig = ldesConfig;
    this._aclConfig = aclConfig;
    this._session = session;

    if (amount) {
      this._amount = amount;
    } else {
      this._amount = 100;
    }
  }

  get ldesConfig(): LDESConfig {
    return this._ldesConfig;
  }

  get aclConfig(): ACLConfig {
    return this._aclConfig;
  }

  get session(): Session {
    return this._session;
  }

  get amount(): number {
    return this._amount;
  }

  static async getConfig(base: string, session: Session): Promise<{ ldesConfig: LDESConfig, aclConfig: ACLConfig }> {
    const rootIRI = `${base}root.ttl`;
    const rootStore = await LDESinSolid.fetchStore(rootIRI, session);
    const aclStore = await LDESinSolid.fetchStore(`${base}.acl`, session);

    // Assumes EventStream its subject is :#Collection
    const shapeIRI = rootStore.getQuads(`${base}#Collection`, TREE.shape, null, null)[0].object.id;

    // assumes node is called :root.ttl and there MUST be one relation
    // when no relation is present, the LDES in LDP is not created yet
    const relation = rootStore.getQuads(rootIRI, TREE.relation, null, null)[0].object.id;

    const relationType = rootStore.getQuads(relation, RDF.type, null, null)[0].object.id;
    const treePath = rootStore.getQuads(relation, TREE.path, null, null)[0].object.id;

    const ldesConfig: LDESConfig = {
      base: base,
      relationType: relationType,
      shape: shapeIRI,
      treePath: treePath
    };

    // currently only handles one agent
    // todo error handling
    const aclConfig: ACLConfig = {
      agent: aclStore.getQuads(null, ACL.agent, null, null)[0].object.id
    };
    return {ldesConfig, aclConfig};
  }

  public async getAmountResources(): Promise<number> {
    // Get current container used as inbox
    const currentContainerLocation = await this.getCurrentContainer();

    // get container and transform to store
    const store = await LDESinSolid.fetchStore(currentContainerLocation, this.session);

    const resources = store.getQuads(currentContainerLocation, LDP.contains, null, null);
    return resources.length;
  }

  public async getCurrentContainer(): Promise<string> {
    const headResponse = await this.session.fetch(this.ldesConfig.base,
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

  /**
     * Fetches the iri and transforms the contents to a N3 Store
     * Note: currently only works for text/turle
     * @param iri
     * @param session
     * @returns {Promise<Store>}
     */
  private static async fetchStore(iri: string, session: Session): Promise<Store> {
    const response = await session.fetch(iri,      {
      method: "GET",
      headers: {
        Accept: "text/turtle"
      }});
    if (response.status !== 200) {
      console.log(await response.text());
      throw Error(`Fetching ${iri} to parse it into an N3 Store has failed.`);
    }
    const currentContainerText = await response.text();
    const textStream = streamify(currentContainerText);
    const quadStream = rdfParser.parse(textStream, {contentType: 'text/turtle', baseIRI: iri});
    const store = await storeStream(quadStream);
    return store;
  }

  /**
     * Creates a container. Only succeeds when a new container was created
     * @param iri
     * @param session
     * @returns {Promise<void>}
     */
  private static async createContainer(iri: string, session: Session): Promise<void> {
    const response = await session.fetch(iri, {
      method: "PUT",
      headers: {
        Link: '<http://www.w3.org/ns/ldp#Container>; rel="type"',
        "Content-Type": 'text/turtle'
      }
    });
    if (response.status !== 201) {
      if (response.status === 205) {
        throw Error(`Root "${iri}" already exists | status code: ${response.status}`);
      }
      throw Error(`Root "${iri}" was not created | status code: ${response.status}`);
    }
    console.log(`LDP container created: ${response.url}`);
  }

  private static async updateAcl(aclIRI: string, aclBody: Acl[], session: Session): Promise<Response> {
    const response = await session.fetch(aclIRI, {
      method: "PUT",
      headers: {
        'Content-Type': 'application/ld+json',
        Link: '<http://www.w3.org/ns/ldp#Resource>; rel="type"'
      },
      body: JSON.stringify(aclBody)
    });
    if (!(response.status === 201 || response.status === 205)) {
      throw Error(`Creating/Updating the ACL file (${aclIRI}) was not successful | Status code: ${response.status}`);
    }
    return response;
  }

  private static async addShape(iri: string, shapeIRI: string, session: Session): Promise<void> {
    const response = await session.fetch(iri, {
      method: "PUT",
      headers: {
        Link: `<${shapeIRI}>; rel="${LDP.constrainedBy}"`,
        "Content-Type": 'text/turtle'
      }
    });
    if (response.status !== 205) {
      throw Error(`Adding the shape to the container (${iri}) was not successful | status code: ${response.status}`);
    }
    console.log(`Shape validation added to ${response.url}`);
  }

  private static async updateInbox(iri: string, inboxIRI: string, session: Session): Promise<void> {
    const response = await session.fetch(iri, {
      method: "PUT",
      headers: {
        Link: `<${inboxIRI}>; rel="${LDP.inbox}"`,
        "Content-Type": 'text/turtle'
      }
    });
    if (response.status !== 205) {
      throw Error(`Updating the inbox was not successful | Status code: ${response.status}`);
    }
    console.log(`${response.url} is now the inbox of the LDES.`);
  }

  public async createLDESinLDP():Promise<void> {
    // create root container
    await LDESinSolid.createContainer(this.ldesConfig.base, this.session);

    // create acl in root container (ACL:Control for agent and ACL:Read for everybody) // TODO: ACL permissions for everybody should be in config
    const agentControlACL = createAclContent('orchestrator', [ACL.Read, ACL.Write, ACL.Control], this.aclConfig.agent);
    const readACL = createAclContent('#authorization', [ACL.Read]);
    await LDESinSolid.updateAcl(`${this.ldesConfig.base}.acl`, [agentControlACL, readACL], this.session);

    const firstContainerName = new Date().getTime().toString();
    const firstContainerIRI = `${this.ldesConfig.base + firstContainerName}/`;
    // create first container
    await LDESinSolid.createContainer(firstContainerIRI, this.session);

    // add shape triple to container .meta
    await LDESinSolid.addShape(firstContainerIRI, this.ldesConfig.shape, this.session);

    // change inbox header in root container .meta
    await LDESinSolid.updateInbox(this.ldesConfig.base, firstContainerIRI, this.session);

    // create acl file for first container to read + append
    const readAppendACL = createAclContent('#authorization', [ACL.Read, ACL.Append]);
    await LDESinSolid.updateAcl(`${firstContainerIRI}.acl`, [agentControlACL, readAppendACL], this.session);

    // create root.ttl
    const eventStream = await createEventStream(this.ldesConfig.shape, this.ldesConfig.treePath, firstContainerName, this.ldesConfig.base);
    const writer = new Writer();
    const rootText = writer.quadsToString(eventStream.getQuads(null, null, null, null));
    const postRootResponse = await this.session.fetch(this.ldesConfig.base, {
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
