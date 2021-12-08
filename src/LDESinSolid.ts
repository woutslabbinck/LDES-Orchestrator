/***************************************
 * Title: LDESinSolidv2
 * Description: class for LDES in Solid
 * Author: Wout Slabbinck (wout.slabbinck@ugent.be)
 * Created on 01/12/2021
 *****************************************/
import {Session} from "@inrupt/solid-client-authn-node";
import {Store, Writer} from "n3";
import rdfParser from "rdf-parse";
import {Logger} from "./logging/Logger";
import {AccessMode, AccessSubject, createAclContent} from "./util/Acl";
import {addRelation, createEventStream} from "./util/EventStream";
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
  private static readonly staticLogger = new Logger(LDESinSolid.name);
  private readonly logger = LDESinSolid.staticLogger;

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
    const shapeIRI = rootStore.getQuads(`${rootIRI}#Collection`, TREE.shape, null, null)[0].object.id;

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
    const response = await session.fetch(iri, {
      method: "GET",
      headers: {
        Accept: "text/turtle"
      }
    });
    if (response.status !== 200) {
      this.staticLogger.info(await response.text());
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
    this.staticLogger.info(`LDP container created: ${response.url}`);
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
    this.staticLogger.info(`Shape validation added to ${response.url}`);
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
    this.staticLogger.info(`${iri} is now the inbox of the LDES.`);
  }

  private static async addRelation(iri: string, ldesConfig: LDESConfig, session: Session): Promise<void> {
    const rootIRI = `${ldesConfig.base}root.ttl`;
    const rootStore = await this.fetchStore(rootIRI, session);

    // get the new name from the iri with a regex (should be last string between slashes)
    const regex = /\/([^/]*)\/$/.exec(iri);
    if (!regex) throw Error(`expected "${iri}" to be an IRI.`);
    const newNodeName = regex[1];

    addRelation(rootStore, ldesConfig.treePath, ldesConfig.relationType, newNodeName, ldesConfig.base);

    // Convert store to string
    const writer = new Writer();
    const rootText = writer.quadsToString(rootStore.getQuads(null, null, null, null));

    // Update root.ttl
    const updateRootResponse = await session.fetch(rootIRI, {
      method: "PUT",
      headers: {
        "Content-Type": 'text/turtle',
        Link: '<http://www.w3.org/ns/ldp#Resource>; rel="type"',
      },
      body: rootText
    });
    if (updateRootResponse.status !== 205) {
      throw Error(`Updating the LDES root was not successful | Status code: ${updateRootResponse.status}`);
    }
    this.staticLogger.info(`${updateRootResponse.url}  is updated with a new relation to ${iri}.`);
  }

  /**
   * Creates a new LDES in LDP.
   * First the ldp:Container is created where everything will reside.
   * Then a new container is added as defined in the UML sequence diagram for LDES in LDP.
   * Finally a root is created (instead of updated).
   *
   * When the public can append to the new container, @param accessSubject should be AccessSubject.Public or left blank.
   * When only the owner can append to the new container, it should be AccessSubject.Agent.
   *
   * @param accessSubject
   * @returns {Promise<void>}
   */
  public async createLDESinLDP(accessSubject?: AccessSubject): Promise<void> {
    accessSubject = accessSubject !== undefined ? accessSubject : AccessSubject.Public;
    // create root container
    await LDESinSolid.createContainer(this.ldesConfig.base, this.session);

    // create acl in root container (ACL:Control for agent and ACL:Read for everybody) // TODO: ACL permissions for everybody should be in config
    const aclRootBody = this.createACLBody(accessSubject, AccessMode.Read);
    await LDESinSolid.updateAcl(`${this.ldesConfig.base}.acl`, aclRootBody, this.session);

    const firstContainerName = new Date().getTime().toString();
    const firstContainerIRI = `${this.ldesConfig.base + firstContainerName}/`;
    // create first container
    await LDESinSolid.createContainer(firstContainerIRI, this.session);

    // add shape triple to container .meta
    await LDESinSolid.addShape(firstContainerIRI, this.ldesConfig.shape, this.session);

    // change inbox header in root container .meta
    await LDESinSolid.updateInbox(this.ldesConfig.base, firstContainerIRI, this.session);

    // create acl file for first container to read + append
    const aclNewBody = this.createACLBody(accessSubject, AccessMode.ReadAppend);
    await LDESinSolid.updateAcl(`${firstContainerIRI}.acl`, aclNewBody, this.session);

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
    this.logger.info(`${postRootResponse.url} is the EventStream and view of the LDES in LDP.`);
  }

  /**
   * Creates a new container when the old container is deemed full.
   * It follows the sequence described in the UML sequence diagram for LDES in LDP.
   *
   * When the public can append to the new container, @param accessSubject should be AccessSubject.Public or left blank.
   * When only the owner can append to the new container, it should be AccessSubject.Agent.
   *
   * @param accessSubject
   * @returns {Promise<void>}
   */
  public async createNewContainer(accessSubject?: AccessSubject): Promise<void> {
    const currentContainerAmountResources = await this.getAmountResources();
    const oldContainer = await this.getCurrentContainer();
    accessSubject = accessSubject !== undefined  ? accessSubject : AccessSubject.Public;

    if (currentContainerAmountResources < this.amount) {
      this.logger.info(`No need for orchestrating as current amount of resources (${currentContainerAmountResources}) is less than the maximum allowed amount of resources per container (${this.amount})`);
      return;
    }
    this.logger.info(`Current amount of resources (${currentContainerAmountResources}) is greater or equal than the maximum allowed amount of resources per container (${this.amount}).`);
    this.logger.info(`Creating new container as inbox has started:`);

    const newContainerName = new Date().getTime().toString();
    const newContainerIRI = `${this.ldesConfig.base + newContainerName}/`;

    // create new container
    await LDESinSolid.createContainer(newContainerIRI, this.session);

    // add shape triple to container .meta
    await LDESinSolid.addShape(newContainerIRI, this.ldesConfig.shape, this.session);

    // create acl file for new container to read + append
    const aclNewBody = this.createACLBody(accessSubject, AccessMode.ReadAppend);
    await LDESinSolid.updateAcl(`${newContainerIRI}.acl`, aclNewBody, this.session);

    // change inbox header in root container .meta
    await LDESinSolid.updateInbox(this.ldesConfig.base, newContainerIRI, this.session);

    // update acl of current container to only read
    const aclCurrentBody = this.createACLBody(accessSubject, AccessMode.Read);
    await LDESinSolid.updateAcl(`${oldContainer}.acl`, aclCurrentBody, this.session);

    // update relation in root.ttl
    await LDESinSolid.addRelation(newContainerIRI, this.ldesConfig, this.session);
  }

  /**
   * Create the AclBody
   * When the subject is public, everybody is allowed to interact with the accompanying resources
   * @param accessSubject
   * @param accessMode mode for interacting with the accompanying resource
   * @returns {Acl[]}
   */
  private createACLBody(accessSubject: AccessSubject, accessMode: AccessMode): Acl[] {
    const aclBody: Acl[] = [];
    // always allow that the agent has control over the resources
    aclBody.push(createAclContent('#orchestrator', [ACL.Read, ACL.Write, ACL.Control], this.aclConfig.agent));
    if (accessSubject === AccessSubject.Public) {
      switch (accessMode) {
      case AccessMode.ReadAppend:
        aclBody.push(createAclContent('#authorization', [ACL.Read, ACL.Append]));
        break;
      case AccessMode.Read:
        aclBody.push(createAclContent('#authorization', [ACL.Read]));
        break;
      default:
      }
    }
    return aclBody;
  }
}

