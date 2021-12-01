/***************************************
 * Title: index
 * Description: Trying to implement the basic orchestrator
 * Author: Wout Slabbinck (wout.slabbinck@ugent.be)
 * Created on 26/11/2021
 *****************************************/
import {readFileSync} from "fs";
import {Session} from "@inrupt/solid-client-authn-node";
import {config} from 'dotenv';
import {LDESinSolid} from "./LDESinSolidv2";

const credentials = JSON.parse(readFileSync('config.json', 'utf-8'));
config();

async function getConfig(): Promise<void> {
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

  const config = await LDESinSolid.getConfig(base, session);
  const ldes = new LDESinSolid(config.ldesConfig, config.aclConfig, session);

  console.log(await ldes.getAmountResources());


  process.exit();
}


async function execute(): Promise<void>{
  // test whether getConfig works
  await getConfig();
}
execute();
