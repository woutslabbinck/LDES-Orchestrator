/***************************************
 * Title: LDESinSolidv2
 * Description: class for LDES in Solid
 * Author: Wout Slabbinck (wout.slabbinck@ugent.be)
 * Created on 01/12/2021
 *****************************************/
import {Session} from "@inrupt/solid-client-authn-node";
import {Store} from "n3";
import rdfParser from "rdf-parse";
import {ACLConfig, LDESConfig} from "./util/Interfaces";
import {ACL, LDP, RDF, TREE} from "./util/Vocabularies";

const parse = require('parse-link-header');
const storeStream = require("rdf-store-stream").storeStream;
const streamify = require('streamify-string');

export class LDESinSolid {
  private _ldesConfig: LDESConfig;
  private _aclConfig: ACLConfig;
  private _amount: number;
  private _session: Session;

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
    const response = await session.fetch(iri);
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
}
