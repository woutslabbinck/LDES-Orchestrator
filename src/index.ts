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
  const session1 = new Session();
  session1.onNewRefreshToken((newToken: string): void => {
    console.log("New refresh token: ", newToken);
  });
  await session1.login({
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    refreshToken: credentials.refreshToken,
    oidcIssuer: credentials.issuer,
  });
  const ldes = new LDESinSolid(session1,'https://tree.linkeddatafragments.org/announcements/',5);
  // console.time('get Resources');
  // const amount = await ldes.getAmountResources();
  // console.log(amount);
  // console.timeEnd('get Resources');

  // create container
  // await ldes.createContainer('test');
  // update inbox
  // await ldes.updateInbox('test');

  // update acl?
  // const response = await session1.fetch('https://tree.linkeddatafragments.org/announcements/test/.acl');
  // console.log(await response.text());

  await ldes.addrelation('1638189083587');
  process.exit();
}

authorisedPost();
