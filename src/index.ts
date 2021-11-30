/***************************************
 * Title: index
 * Description: Trying to implement the basic orchestrator
 * Author: Wout Slabbinck (wout.slabbinck@ugent.be)
 * Created on 26/11/2021
 *****************************************/
import {readFileSync} from "fs";
import {Session} from "@inrupt/solid-client-authn-node";
import {config} from 'dotenv';
import {Writer} from "n3";
import {LDESinSolid} from "./LDESinSolid";
import {Orchestrator} from "./Orchestrator";
import {createEventStream} from "./util/EventStream";

const credentials = JSON.parse(readFileSync('config.json','utf-8'));
config();

async function orchestrator(): Promise<void> {
  const session = new Session();
  session.onNewRefreshToken((newToken: string): void => {
    console.log("New refresh token: ", newToken);
  });
  await session.login({
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    refreshToken: credentials.refreshToken,
    oidcIssuer: credentials.issuer,
  });

  const ldes = new LDESinSolid(session,'https://tree.linkeddatafragments.org/announcements/',1);

  const orchestrator = new Orchestrator(ldes);
  await orchestrator.init();
  await orchestrator.execute();

  process.exit();
}

// orchestrator();

async function createLDES() {
  // const session = new Session();
  // session.onNewRefreshToken((newToken: string): void => {
  //   console.log("New refresh token: ", newToken);
  // });
  // await session.login({
  //   clientId: credentials.clientId,
  //   clientSecret: credentials.clientSecret,
  //   refreshToken: credentials.refreshToken,
  //   oidcIssuer: credentials.issuer,
  // });
  const agent ='https://pod.inrupt.com/woutslabbinck/profile/card#me';

  const shape = 'https://tree.linkeddatafragments.org/announcements/shape';
  const treePath= 'http://purl.org/dc/terms/modified';
  const base = 'https://tree.linkeddatafragments.org/announcements/test/';
  const firstNodeName =    new Date().getTime().toString();

  const store = await createEventStream(shape,treePath,firstNodeName,base);
  const writer = new Writer();
  const output = writer.quadsToString(store.getQuads(null, null, null, null));
  console.log(output);
  // const ldes = new LDESinSolid(session,base);
  // await ldes.createLDES(shape,agent);
  process.exit();

}

createLDES();
