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

const credentials = JSON.parse(readFileSync('config.json','utf-8'));
config();

async function authorisedPost(): Promise<void> {
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

authorisedPost();
