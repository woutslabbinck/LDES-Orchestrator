/***************************************
 * Title: Login.ts
 * Description: TODO
 * Author: Wout Slabbinck (wout.slabbinck@ugent.be)
 * Created on 26/11/2021
 *****************************************/

import {writeFileSync} from "fs";
import {
  ILoginInputOptions, InMemoryStorage,
  Session
} from "@inrupt/solid-client-authn-node";

import {config} from 'dotenv';
import express from "express";

config();

type InputOptions = {
    solidIdentityProvider: string;
    applicationName?: string;
    registrationType: "static" | "dynamic";
};
const validatedOptions: InputOptions = {
  applicationName: "LDES-orchestrator",
  registrationType: "dynamic",
  solidIdentityProvider: process.env.SOLID_IDP!

};
export async function login(): Promise<any> {
  const app = express();
  const port = 3000;
  const iriBase = `http://localhost:${port}`;
  const storage = new InMemoryStorage();

  const session: Session = new Session({
    insecureStorage: storage,
    secureStorage: storage,
  });

  const server = app.listen(port, async () => {
    console.log(`Listening at: [${iriBase}].`);
    const loginOptions: ILoginInputOptions = {
      clientName: validatedOptions.applicationName,
      oidcIssuer: validatedOptions.solidIdentityProvider,
      redirectUrl: iriBase,
      tokenType: "DPoP",
      handleRedirect: (url: string) => {
        console.log(`\nPlease visit ${url} in a web browser.\n`);
      },
    };
    console.log(
      `Logging in to Solid Identity Provider  ${validatedOptions.solidIdentityProvider} to get a refresh token.`
    );

    session.login(loginOptions).catch((e) => {
      throw new Error(
        `Logging in to Solid Identity Provider [${
          validatedOptions.solidIdentityProvider
        }] failed: ${e.toString()}`
      );
    });
  });

  app.get("/", async (_req: { url: string | URL; }, res: { send: (arg0: string) => void; }) => {
    const redirectIri = new URL(_req.url, iriBase).href;
    console.log(
      `Login into the Identity Provider successful, receiving request to redirect IRI [${redirectIri}].`
    );
    await session.handleIncomingRedirect(redirectIri);
    // NB: This is a temporary approach, and we have work planned to properly
    // collect the token. Please note that the next line is not part of the public
    // API, and is therefore likely to break on non-major changes.
    const rawStoredSession = await storage.get(
      `solidClientAuthenticationUser:${session.info.sessionId}`
    );
    if (rawStoredSession === undefined) {
      throw new Error(
        `Cannot find session with ID [${session.info.sessionId}] in storage.`
      );
    }
    const storedSession = JSON.parse(rawStoredSession);

    res.send(
      "The tokens have been sent to @inrupt/generate-oidc-token. You can close this window."
    );

    // write session away
    writeFileSync('config.json',JSON.stringify(storedSession));

    server.close();
    process.exit();
  });
}
// login().then((value) => console.log(value)).catch((error) => console.log);
login();
