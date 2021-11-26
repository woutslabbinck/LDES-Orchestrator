/***************************************
 * Title: index
 * Description: Trying to implement the basic orchestrator
 * Author: Wout Slabbinck (wout.slabbinck@ugent.be)
 * Created on 26/11/2021
 *****************************************/
import {readFileSync} from "fs";
import {Session} from "@inrupt/solid-client-authn-node";
import {config} from 'dotenv';


const credentials = JSON.parse(readFileSync('config.json','utf-8'));
config();

async function authorisedPost(): Promise<void> {
  const session1 = new Session();
  session1.onNewRefreshToken((newToken: string): void => {
    console.log("New refresh token: ", newToken);
  });
  await session1.login({
    // 2. Use the authenticated credentials to log in the session.
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    refreshToken: credentials.refreshToken,
    // Set oidcIssuer to the Solid Identity Provider associated with the credentials.
    oidcIssuer: credentials.issuer,
    // If the refresh token is updated by the Identity Provider, this callback gets invoked.
  });
  if (session1.info.isLoggedIn) {
    const response = await session1.fetch('https://tree.linkeddatafragments.org/announcements/root.ttl');
    console.log(await response.text());
  }
  await session1.logout();
  process.exit();
}

authorisedPost();
