/***************************************
 * Title: index
 * Description: Trying to implement the basic orchestrator
 * Author: Wout Slabbinck (wout.slabbinck@ugent.be)
 * Created on 26/11/2021
 *****************************************/

import {Session} from "@rubensworks/solid-client-authn-isomorphic";
import {LDESinSolid} from "./LDESinSolid";
import {getSession, isLoggedin, login} from "./Login";
import {Orchestrator} from "./Orchestrator";
import {AccessSubject} from "./util/Acl";

let session : Session;
async function getConfig(): Promise<void> {
  const base = 'http://localhost:3050/new/';
  // const base = 'https://tree.linkeddatafragments.org/announcements/';

  const config = await LDESinSolid.getConfig(base, session);
  const ldes = new LDESinSolid(config.ldesConfig, config.aclConfig, session);

  console.log(await ldes.getAmountResources());
}

async function createNewLDES(): Promise<void> {
  const ldesConfig = {
    base: 'https://tree.linkeddatafragments.org/announcements/new/',
    treePath: 'http://purl.org/dc/terms/modified', // valid shacl path
    shape: 'https://tree.linkeddatafragments.org/announcements/shape', // IRI of the shape (to which all the members of the EventStream must conform to) (note: currently only SHACL shapes)
    relationType: 'https://w3id.org/tree#GreaterThanOrEqualToRelation', // default: https://w3id.org/tree#GreaterThanOrEqualToRelation
  };
  const aclConfig = {
    agent: 'https://pod.inrupt.com/woutslabbinck/profile/card#me' // this is the webId used in the session
    // this is the webId used in the session
  };
  const ldes = new LDESinSolid(ldesConfig, aclConfig, session);
  await ldes.createLDESinLDP();
}

async function addRelation(): Promise<void> {
  const base = 'https://tree.linkeddatafragments.org/announcements/new/';
  const config = await LDESinSolid.getConfig(base, session);
  const ldes = new LDESinSolid(config.ldesConfig, config.aclConfig, session, 1);

  await ldes.createNewContainer();

}

async function orchestrate(): Promise<void> {
  const base = 'https://tree.linkeddatafragments.org/announcements/';
  const config = await LDESinSolid.getConfig(base, session);

  const ldes = new LDESinSolid(config.ldesConfig, config.aclConfig, session, 1);
  const orchestrator = new Orchestrator(session);

  await orchestrator.orchestrateLDES(ldes, 5);
}

async function getAcl(): Promise<void> {
  const response = await session.fetch('https://tree.linkeddatafragments.org/datasets/curated/.acl');
  console.log(response.headers.get('content-type'));
  console.log(await response.text());
  const responseTurtle = await session.fetch('https://tree.linkeddatafragments.org/datasets/curated/.acl', {
    method: "GET",
    headers: {
      Accept: "text/turtle"
    }
  });
  console.log(responseTurtle.headers.get('content-type'));
  console.log(await responseTurtle.text());

}

async function createCuratedLDES(): Promise<void> {
  const ldesConfig = {
    base: 'https://tree.linkeddatafragments.org/datasets/curated/',
    treePath: 'http://purl.org/dc/terms/modified', // valid shacl path
    shape: 'https://tree.linkeddatafragments.org/announcements/shape', // IRI of the shape (to which all the members of the EventStream must conform to) (note: currently only SHACL shapes)
    relationType: 'https://w3id.org/tree#GreaterThanOrEqualToRelation', // default: https://w3id.org/tree#GreaterThanOrEqualToRelation
  };
  const aclConfig = {
    agent: 'https://pod.inrupt.com/woutslabbinck/profile/card#me' // this is the webId used in the session
    // this is the webId used in the session
  };
  const ldes = new LDESinSolid(ldesConfig, aclConfig, session);
  await ldes.createLDESinLDP(AccessSubject.Agent); // create private LDES for curation
}

async function execute(): Promise<void> {
  login();
  await isLoggedin();
  session = await getSession();
  const base = 'http://localhost:3050/new/';
  const config = await LDESinSolid.getConfig(base, session);
  const ldes = new LDESinSolid(config.ldesConfig, config.aclConfig, session,1);
  const orchestrator = new Orchestrator(session);
  orchestrator.orchestrateLDES(ldes,1);
  // test whether getConfig works
  // await getConfig();
  // await createNewLDES();
  // await addRelation();
  // await orchestrate();
  // await getAcl();
  // await createCuratedLDES();
  // process.exit();
}

execute();
