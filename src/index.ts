/***************************************
 * Title: index
 * Description: Trying to implement the basic orchestrator
 * Author: Wout Slabbinck (wout.slabbinck@ugent.be)
 * Created on 26/11/2021
 *****************************************/
import {readFileSync} from "fs";
import {Session} from "@inrupt/solid-client-authn-node";
import {config} from 'dotenv';
import {LDESinSolid} from "./LDESinSolid";
import {Orchestrator} from "./Orchestrator";

const credentials = JSON.parse(readFileSync('config.json', 'utf-8'));
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

  const base = 'https://tree.linkeddatafragments.org/announcements/test/';
  // const base = 'https://tree.linkeddatafragments.org/announcements/';

  const ldes = new LDESinSolid(session, base, 1);

  const orchestrator = new Orchestrator(ldes);
  await orchestrator.init();
  await orchestrator.execute();

  process.exit();
}


async function createLDES() {
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

  const agent = 'https://pod.inrupt.com/woutslabbinck/profile/card#me';

  const shape = 'https://tree.linkeddatafragments.org/announcements/shape';
  const treePath = 'http://purl.org/dc/terms/modified';
  const base = 'https://tree.linkeddatafragments.org/announcements/test/';
  const firstNodeName = new Date().getTime().toString();

  // const eventStream = await createEventStream(shape,treePath,firstNodeName,base);
  // const writer = new Writer();
  // const rootText = writer.quadsToString(eventStream.getQuads(null, null, null, null));
  // console.log(rootText);
  const ldes = new LDESinSolid(session, base);
  await ldes.createLDES(shape, agent, treePath);
  process.exit();

}

// orchestrator();
// createLDES();
