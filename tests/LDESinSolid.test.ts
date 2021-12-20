import {readdirSync, readFileSync} from "fs";
import Path from "path";
import {Session} from "@inrupt/solid-client-authn-node";
import {createViewAnnouncement, postAnnouncement} from "@treecg/ldes-announcements";
import {AnnouncementConfig} from "@treecg/ldes-announcements/dist/lib/Writer";
import {Announce} from "@treecg/ldes-announcements/dist/util/Interfaces";
import {Literal} from "n3";
import {LDESConfig, ACLConfig, LDESinSolid, Orchestrator} from "../src";
import {fileAsStore, turtleStringToStore} from "../src/util/Conversion";
import {sleep} from "../src/util/Util";
import {ACL, DCT, LDP, RDF, TREE, XSD, FOAF, LDES} from "../src/util/Vocabularies";
import {solidUrl} from "./solidHelper";

const parse = require('parse-link-header');

describe('Integration test for LDESinSolid and Orchestrating functionalities', () => {
  const base: string = solidUrl();
  let session: Session;
  let announcement: Announce;
  const solidPodPath = Path.join(__dirname, 'solidPod');

  beforeAll(async () => {
    // create session
    session = new Session();
    const rootPath = Path.join(__dirname, '..');
    const configFileName = 'config.json';
    const configPath = Path.join(rootPath, configFileName);

    const credentials = JSON.parse(readFileSync(configPath, 'utf-8'));
    session.onNewRefreshToken((newToken: string): void => {
      console.log("New refresh token: ", newToken);
    });
    await session.login({
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      refreshToken: credentials.refreshToken,
      oidcIssuer: credentials.issuer,
    });

    // create announcement
    const viewString = '<https://test/output/root.ttl> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://w3id.org/tree#Node>.';
    const viewStore = await turtleStringToStore(viewString);
    const announcementConfig: AnnouncementConfig = {
      bucketizer: 'substring',
      creatorName: 'woutslabbinck',
      creatorURL: `https://github.com/woutslabbinck`,
      originalLDESURL: 'https://smartdata.dev-vlaanderen.be/base/gemeente',
      pageSize: '100',
      propertyPath: '<http://www.w3.org/2000/01/rdf-schema#label>',
      viewId: 'https://test/output/root.ttl'
    };
    announcement = await createViewAnnouncement(viewStore, announcementConfig);

  });
  describe('General tests', () => {
    it('server online', async () => {
      const getRequest = await fetch(base);
      expect(getRequest.status).toBe(200);
    });

    it('is logged in', async () => {
      expect(session.info.isLoggedIn).toBe(true);
    });
  });

  describe('LDES-Orchestrator', () => {
    it('Verifying contents of created LDES in LDP', async () => {
      const ldesDirectoryName = 'newLDES';
      const ldesBaseUrl = `${base + ldesDirectoryName}/`;
      const ldesConfig: LDESConfig = {
        base: ldesBaseUrl,
        treePath: DCT.modified,
        shape: 'https://tree.linkeddatafragments.org/announcements/shape',
        relationType: TREE.GreaterThanOrEqualToRelation
      };
      if (!session.info.webId) throw Error("Should be present");
      const aclConfig: ACLConfig = {
        agent: session.info.webId
      };

      const ldes = new LDESinSolid(ldesConfig, aclConfig, session, 1);
      await ldes.createLDESinLDP();

      const ldesPath = Path.join(solidPodPath, ldesDirectoryName);
      const ldesContainerResponse = await session.fetch(ldesBaseUrl, {
        method: "GET",
        headers: {Accept: "text/turtle"}
      });
      const ldesContainerStore = await turtleStringToStore(await ldesContainerResponse.text(), ldesBaseUrl);
      const inboxFromStore = ldesContainerStore.getQuads(ldesBaseUrl, LDP.inbox, null, null)[0].object.id;
      const inboxFromResponse = parse(ldesContainerResponse.headers.get('Link'))[LDP.inbox];
      // inbox Link header url must also be in the metadata
      expect(inboxFromStore).toBe(inboxFromResponse.url);

      // acl content test
      const ldesRootAclResponse = await session.fetch(`${ldesBaseUrl}.acl`, {
        method: "GET",
        headers: {Accept: "text/turtle"}
      });

      const ldesRootAclStore = await turtleStringToStore(await ldesRootAclResponse.text(), `${ldesBaseUrl}.acl`);

      // public contents test
      const ldesRootPublicSubject = ldesRootAclStore.getQuads(null, ACL.agentClass, FOAF.Agent, null)[0].subject.id;
      const ldesRootAccessRightsPublic = ldesRootAclStore.getObjects(ldesRootPublicSubject, ACL.mode, null).map(object => object.id);
      expect(ldesRootAccessRightsPublic.includes(ACL.Read)).toBe(true);


      // private contents test
      const ldesRootPrivateSubject = ldesRootAclStore.getQuads(null, ACL.agent, session.info.webId, null)[0].subject.id;
      const ldesRootAccessRightsPrivate = ldesRootAclStore.getObjects(ldesRootPrivateSubject, ACL.mode, null).map(object => object.id);
      expect(ldesRootAccessRightsPrivate.includes(ACL.Read)).toBe(true);
      expect(ldesRootAccessRightsPrivate.includes(ACL.Write)).toBe(true);
      expect(ldesRootAccessRightsPrivate.includes(ACL.Control)).toBe(true);


      // content of ldes in LDP root directory
      const ldesDirectoryFiles = readdirSync(ldesPath);
      const relationDirectoryName = inboxFromStore.replace(ldesBaseUrl, '').slice(0, -1);

      expect(ldesDirectoryFiles.includes('.meta')).toBe(true);
      expect(ldesDirectoryFiles.includes('.acl$.jsonld') || ldesDirectoryFiles.includes('.acl')).toBe(true);
      expect(ldesDirectoryFiles.includes('root.ttl')).toBe(true);
      expect(ldesDirectoryFiles.includes(relationDirectoryName)).toBe(true);
      expect(ldesDirectoryFiles.length).toBe(4);

      // content of root
      const rootStore = await fileAsStore(Path.join(ldesPath, 'root.ttl'));
      const rootIRI = `${ldesBaseUrl}root.ttl`;

      const collectionIRI = rootStore.getSubjects(RDF.type, LDES.EventStream, null)[0].id;
      expect(rootStore.getObjects(collectionIRI, TREE.shape, null)[0].id).toBe('https://tree.linkeddatafragments.org/announcements/shape');
      expect(rootStore.getObjects(collectionIRI, TREE.view, null)[0].id).toBe(rootIRI);
      expect(rootStore.getObjects(rootIRI, RDF.type, null)[0].id).toBe(TREE.Node);

      expect(rootStore.getObjects(rootIRI, TREE.relation, null).length).toBe(1);
      const relationNode = rootStore.getObjects(rootIRI, TREE.relation, null)[0].id;

      expect(rootStore.getObjects(relationNode, RDF.type, null)[0].id).toBe(ldesConfig.relationType);
      expect(rootStore.getObjects(relationNode, TREE.path, null)[0].id).toBe(ldesConfig.treePath);
      expect(rootStore.getObjects(relationNode, TREE.node, null)[0].id).toBe(`${ldesBaseUrl + relationDirectoryName}/`);
      expect((rootStore.getObjects(relationNode, TREE.value, null)[0] as Literal).datatype.value).toBe(XSD.dateTime);

      // content of first relation directory
      const relationDirectoryPath = Path.join(ldesPath, relationDirectoryName);
      const relationDirectoryFiles = readdirSync(relationDirectoryPath);
      expect(relationDirectoryFiles.includes('.acl$.jsonld') || ldesDirectoryFiles.includes('.acl')).toBe(true);
      // expect(relationDirectoryFiles.includes('.meta')).toBe(true) // Note: only present in shape solid server
      expect(relationDirectoryFiles.length).toBe(1);

      // acl content test of relation container
      const relationAclResponse = await session.fetch(`${ldesBaseUrl + relationDirectoryName}/.acl`, {
        method: "GET",
        headers: {Accept: "text/turtle"}
      });

      const relationAclStore = await turtleStringToStore(await relationAclResponse.text(), `${ldesBaseUrl}.acl`);

      const relationPublicSubject = relationAclStore.getQuads(null, ACL.agentClass, FOAF.Agent, null)[0].subject.id;
      const relationAccessRightsPublic = relationAclStore.getObjects(relationPublicSubject, ACL.mode, null).map(object => object.id);
      expect(relationAccessRightsPublic.includes(ACL.Read)).toBe(true);
      expect(relationAccessRightsPublic.includes(ACL.Append)).toBe(true);

      const relationPrivateSubject = relationAclStore.getQuads(null, ACL.agent, session.info.webId, null)[0].subject.id;
      const relationAccessRightsPrivate = relationAclStore.getObjects(relationPrivateSubject, ACL.mode, null).map(object => object.id);
      expect(relationAccessRightsPrivate.includes(ACL.Read)).toBe(true);
      expect(relationAccessRightsPrivate.includes(ACL.Write)).toBe(true);
      expect(relationAccessRightsPrivate.includes(ACL.Control)).toBe(true);
      // shape url should be in metadata Note: Only present in shape solid server
      // const relationMetaStore = await fileAsStore(Path.join(relationDirectoryPath, '.meta'))
      // expect(relationMetaStore.getObjects(null, LDP.constrainedBy, null)[0].id)
      //     .toBe('https://tree.linkeddatafragments.org/announcements/shape')


    });

    it('verify ldes in solid works', async () => {
      /**
       * This function creates an ldes, adds an announcement and verifies that orchestration works.
       * That is that after the limit of 1 was reached, a new container is created
       */
      const ldesBaseUrl = `${base}ldes/`;
      const ldesConfig: LDESConfig = {
        base: ldesBaseUrl,
        treePath: DCT.modified,
        shape: 'https://tree.linkeddatafragments.org/announcements/shape',
        relationType: TREE.GreaterThanOrEqualToRelation
      };
      if (!session.info.webId) throw Error("Should be present");
      const aclConfig: ACLConfig = {
        agent: session.info.webId
      };

      const ldes = new LDESinSolid(ldesConfig, aclConfig, session, 1);
      await ldes.createLDESinLDP();

      const firstContainer = await ldes.getCurrentContainer();

      const emptyLDES = await ldes.getAmountResources();
      expect(emptyLDES).toBe(0);


      const response = await postAnnouncement(announcement, ldesBaseUrl);
      expect(response.status).toBe(201);

      const oneResource = await ldes.getAmountResources();
      expect(oneResource).toBe(1);


      const orchestrator = new Orchestrator(session);
      orchestrator.orchestrateLDES(ldes, .1);
      await sleep(200);
      orchestrator.stopOrchestrating();
      await sleep(1000);

      const againEmpty = await ldes.getAmountResources();
      expect(againEmpty).toBe(0);
      const secondContainer = await ldes.getCurrentContainer();

      expect(firstContainer).not.toBe(secondContainer);
      expect(firstContainer).toContain(ldesBaseUrl);
      expect(secondContainer).toContain(ldesBaseUrl);

    });
  });

});
