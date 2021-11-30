/***************************************
 * Title: Acl
 * Description: Util function to create Acl files
 * Author: Wout Slabbinck (wout.slabbinck@ugent.be)
 * Created on 30/11/2021
 *****************************************/

import {URI} from "@treecg/tree-metadata-extraction/src/util/Util";
import {Acl} from "./Interfaces";
import {ACL, FOAF} from "./Vocabularies";

export function createAclContent(id: string, modes: string[]): Acl
export function createAclContent(id: string, modes: string[], agent: string): Acl
export function createAclContent(id: string, modes: string[], agent?: string): Acl {
  const uriModes: URI[] = [];
  modes.forEach(mode => uriModes.push({"@id": mode}));

  const aclBody: Acl = {
    "@context": {'@vocab': ACL.namespace},
    "@id": id,
    "@type": [ACL.Authorization],
    accessTo: {'@id': './'},
    default: {'@id': './'},
    mode: uriModes
  };
  if (!agent) {
    aclBody['agentClass'] = {"@id": FOAF.Agent};
  } else {
    aclBody['agent'] = {"@id": agent};
  }
  return aclBody;
}
