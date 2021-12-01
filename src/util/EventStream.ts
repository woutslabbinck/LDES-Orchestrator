/***************************************
 * Title: EventStream
 * Description: Methods to create an LDES and add a specific relation to an LDES
 * Author: Wout Slabbinck (wout.slabbinck@ugent.be)
 * Created on 30/11/2021
 *****************************************/
import {Collection, Node} from "@treecg/tree-metadata-extraction/dist/util/Util";
import {DataFactory, Store} from "n3";
import rdfParser from "rdf-parse";
import {LDES, RDF, TREE, XSD} from "./Vocabularies";
import namedNode = DataFactory.namedNode;
import literal = DataFactory.literal;

const streamify = require('streamify-string');
const storeStream = require("rdf-store-stream").storeStream;

/**
 * Creates an LDES EventStream with the first relation
 *
 * @param shape Shape IRI
 * @param treePath IRI of the SHACL path on which the value of the relations will act
 * @param firstNodeName a string timestamp, which is the name the node of the first relation
 * @param base The base IRI (without the root.ttl suffix)
 * @returns {Promise<Store>}
 */
export async function createEventStream(shape: string, treePath: string, firstNodeName: string, base: string): Promise<Store> {
  const eventStream: Collection = {
    "@context": {'@vocab': TREE.namespace},
    "@id": "#Collection",
    "@type": [LDES.EventStream],
    shape: [{"@id": shape}],
    view: [{"@id": "root.ttl"}]
  };

  const view: Node = {
    "@context": {'@vocab': TREE.namespace},
    "@id": "root.ttl",
    "@type": [TREE.Node],
    relation: []
  };

  const text = JSON.stringify([eventStream, view]);
  const textStream = streamify(text);
  const quadStream = rdfParser.parse(textStream, {contentType: 'application/ld+json', baseIRI: base});
  const store = await storeStream(quadStream);

  addRelation(store, treePath, TREE.GreaterThanOrEqualToRelation, firstNodeName, base);
  return store;
}

/**
 * Adds a relation (to a certain node) to an existing root Node
 *
 * @param store The store which consists of the current root node
 * @param treePath The SHACL path to used to compare the relation with
 * @param treeRelation The type of TREE relation
 * @param newNode The node to where the relation points. MUST be a string representation of an ISO timestamp (e.g. "1638353126973")
 * @param base The IRI of the container where the root is stored
 */
export function addRelation(store: Store, treePath: string, treeRelation: string, newNode: string, base: string): void {
  const relationNode = store.createBlankNode();
  const dateTimeISO = new Date(Number(newNode)).toISOString();
  const rootNode = `${base}root.ttl`;
  const firstNode = `${base + newNode}/`;

  store.addQuad(namedNode(rootNode), namedNode(TREE.relation), relationNode);

  store.addQuad(relationNode, namedNode(RDF.type), namedNode(treeRelation));
  store.addQuad(relationNode, namedNode(TREE.node), namedNode(firstNode));
  store.addQuad(relationNode, namedNode(TREE.path), namedNode(treePath));
  store.addQuad(relationNode, namedNode(TREE.value), literal(dateTimeISO, namedNode(XSD.dateTime)));
}
