/***************************************
 * Title: LDESinSolid
 * Description: class for LDES in Solid
 * Author: Wout Slabbinck (wout.slabbinck@ugent.be)
 * Created on 29/11/2021
 *****************************************/
import {Session} from "@inrupt/solid-client-authn-node";
import {DataFactory, Store, Writer} from "n3";
import rdfParser from 'rdf-parse';
import {DCT, LDP, RDF, TREE, XSD} from "./util/Vocabularies";

const {namedNode, literal} = DataFactory;

const parse = require('parse-link-header');
const streamify = require('streamify-string');
const storeStream = require("rdf-store-stream").storeStream;

export class LDESinSolid {
  private session: Session;
  private readonly root: string;
  private readonly containerAmount: number;

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
    const newContainerName = new Date().getTime().toString();
    // create container
    await this.createContainer(newContainerName);

    // add shape triple to container .meta
    // todo now

    // update acl of old container to only read
    // todo after answer joachim

    // change inbox header in root container .meta
    await this.updateInbox(newContainerName);

    // update acl of new container to read + append
    // todo after answer joachim

    // update relation in root.ttl
    await this.addrelation(newContainerName);

    return `Orchestrating succeeded: new container can be found at ${this.root}${newContainerName}/`;
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
    return `${inboxLink.url}/`;
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

    const currentContainerResponse = await this.session.fetch(iri);
    console.log(`Fetching ${iri} | Status: ${currentContainerResponse.status}`);
    const currentContainerText = await currentContainerResponse.text();
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

  public async createContainer(slug: string): Promise<void> {
    this.isLoggedIn();

    const response = await this.session.fetch(`${this.root + slug}/`, {
      method: "PUT",
      headers: {
        Link: '<http://www.w3.org/ns/ldp#Container>; rel="type"',
        "Content-Type": 'text/turtle'
      }
    });
    if (response.status !== 201) {
      throw Error(`New Container "${slug}" was not created on ${this.root}`);
    }
  }

  public async updateInbox(slug: string): Promise<void> {
    this.isLoggedIn();
    const response = await this.session.fetch(this.root, {
      method: "PUT",
      headers: {
        Link: `<${this.root + slug}/>; rel="${LDP.inbox}"`,
        "Content-Type": 'text/turtle'
      }
    });
    console.log(response);
  }

  public async addrelation(newContainerName: string) {
    const rootIRI = `${this.root}root.ttl`;
    const createdIRI = `${this.root + newContainerName}/`;

    const ldesRootStore = await this.fetchStore(rootIRI);
    const relationNode = ldesRootStore.createBlankNode();

    const treePath = DCT.modified; // todo: fetch decent
    const dateTimeISO = new Date(Number(newContainerName)).toISOString();

    ldesRootStore.addQuad(namedNode(rootIRI), namedNode(TREE.relation), relationNode);

    ldesRootStore.addQuad(relationNode, namedNode(RDF.type), namedNode(TREE.GreaterThanOrEqualToRelation));
    ldesRootStore.addQuad(relationNode, namedNode(TREE.node), namedNode(createdIRI));
    ldesRootStore.addQuad(relationNode, namedNode(TREE.path), namedNode(treePath));
    ldesRootStore.addQuad(relationNode, namedNode(TREE.value), literal(dateTimeISO, namedNode(XSD.dateTime)));

    const writer = new Writer();
    const text = writer.quadsToString(ldesRootStore.getQuads(null, null, null, null));
    console.log(text);

  }
}
