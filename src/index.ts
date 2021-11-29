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

  const ldes = new LDESinSolid(session,'https://tree.linkeddatafragments.org/announcements/',5);

  console.log(await ldes.orchestrate());
  // console.time('get Resources');
  // const amount = await ldes.getAmountResources();
  // console.log(amount);
  // console.timeEnd('get Resources');
  const response= await session.fetch('https://tree.linkeddatafragments.org/announcements/1636985640000/.acl', {
    headers: {
      'Accept': 'text/turtle'
    }
  });
  console.log(await response.text());

  process.exit();
}

authorisedPost();
