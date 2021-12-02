import {URI} from "@treecg/tree-metadata-extraction/src/util/Util";

/***************************************
 * Title: Interfaces
 * Description: Interfaces used in LDES-Orchestrator
 * Author: Wout Slabbinck (wout.slabbinck@ugent.be)
 * Created on 30/11/2021
 *****************************************/
export interface Acl {
    '@context'?: string | object;
    '@id': string;
    '@type': string[];
    mode: URI[];
    accessTo: URI;
    default: URI;
    agent?: URI;
    agentClass?: URI;
}

export interface LDESConfig {
    base: string;
    treePath: string;
    shape: string;
    relationType: string;
}

export interface ACLConfig {
    agent: string
}
