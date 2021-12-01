import {LDESinSolid} from "./LDESinSolid";
import {createAclContent} from "./util/Acl";
import {ACL} from "./util/Vocabularies";

/***************************************
 * Title: Orchestrator
 * Description: Orchestrator class with methods to control it
 * Author: Wout Slabbinck (wout.slabbinck@ugent.be)
 * Created on 30/11/2021
 *****************************************/

export class Orchestrator {
  private ldes: LDESinSolid;

  constructor(ldes: LDESinSolid) {
    this.ldes = ldes;
    // todo: add agent
  }
  public async init(): Promise<void>{
    await this.ldes.init();
  }

  public async execute(): Promise<void> {
    const currentAmount = await this.ldes.getAmountResources();
    const oldContainer = await this.ldes.getCurrentContainer();

    if (currentAmount < this.ldes.containerAmount) {
      console.log(`No need for orchestrating as current amount of resources (${currentAmount}) is less than the maximum allowed amount of resources per container (${this.ldes.containerAmount}).`);
      return;
    }
    console.log(`Current amount of resources (${currentAmount}) is greater or equal than the maximum allowed amount of resources per container (${this.ldes.containerAmount}).
    Creating new container as inbox has started:`);
    const newContainerName = new Date().getTime().toString();

    const newContainerResponse = await this.ldes.createContainer(newContainerName);
    if (newContainerResponse.status !== 201) {
      throw Error(`New Container "${newContainerName}" was not created on ${this.ldes.root} | status code: ${newContainerResponse.status}`);
    }
    console.log(`LDP container (${newContainerName}) created for the next ${this.ldes.containerAmount} members of the LDES  at url: ${newContainerResponse.url}`);


    // add shape triple to container .meta
    const addShapeResponse = await this.ldes.addShape(newContainerName);
    if (addShapeResponse.status !== 205) {
      throw Error(`Adding the shape to the new container was not successful | status code: ${addShapeResponse.status}`);
    }
    console.log(`Shape validation added to ${addShapeResponse.url}`);

    // change inbox header in root container .meta
    const updateInboxResponse = await this.ldes.updateInbox(newContainerName);
    if (updateInboxResponse.status !== 205) {
      throw Error(`Updating the inbox was not successful | Status code: ${updateInboxResponse.status}`);
    }
    console.log(`${updateInboxResponse.url} is now the inbox of the LDES.`);

    // update acl of old container to only read
    const orchestratorAcl = createAclContent('orchestrator', [ACL.Read, ACL.Write, ACL.Control], 'https://pod.inrupt.com/woutslabbinck/profile/card#me');
    const aclReadStore = createAclContent('#authorization', [ACL.Read]);
    const oldAclResponse = await this.ldes.updateAcl(`${oldContainer}.acl`, [aclReadStore, orchestratorAcl]);
    if (oldAclResponse.status !== 205) {
      throw Error(`Updating the ACL file of ${oldContainer} was not successful | Status code: ${oldAclResponse.status}`);
    }
    console.log(`ACL file of ${oldContainer} updated to READ ONLY.`);


    // create acl file for new container to read + append
    const newContainerIRI = `${this.ldes.root + newContainerName}/`;
    const aclReadAppend = createAclContent('#authorization', [ACL.Read, ACL.Append]);
    const newAclResponse = await this.ldes.updateAcl(`${newContainerIRI}.acl`, [aclReadAppend, orchestratorAcl]);
    if (newAclResponse.status !== 201) {
      throw Error(`Creating the ACL file for ${newContainerIRI} was not successful | Status code: ${newAclResponse.status}`);
    }
    console.log(`ACL file of ${newContainerIRI} created as READ and APPEND ONLY; writing to the inbox is now possible.`);



    // update relation in root.ttl
    const addRelationResponse = await this.ldes.addRelation(newContainerName);
    if (addRelationResponse.status !== 205) {
      throw Error(`Updating the LDES root was not successful | Status code: ${addRelationResponse.status}`);
    }
    console.log(`${addRelationResponse.url}  is updated with a new relation to ${newContainerIRI}`);

    console.log(`Orchestrating succeeded: new container can be found at ${newContainerIRI}`);
  }
}
