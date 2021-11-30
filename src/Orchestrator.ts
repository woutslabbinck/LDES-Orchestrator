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
    console.log('Container created');


    // temp remove shape validation on old container
    // TODO: remove these lines after updating CSS as the shape validation must stay there
    const container = await this.ldes.getCurrentContainer();
    const resp = await this.ldes.session.fetch(container, {
      method: "PUT",
      headers: {
        "Content-Type": 'text/turtle'
      }
    });
    if (resp.status !== 205) {
      console.log(await resp.text());
      throw Error("for some reason I could not delete shape triple");
    }

    // update acl of old container to only read
    const oldContainer = await this.ldes.getCurrentContainer();
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

    // add shape triple to container .meta
    // TODO: after shapevalidation update in CSS -> move after creating container
    const addShapeResponse = await this.ldes.addShape(newContainerName);
    if (addShapeResponse.status !== 205) {
      throw Error(`Adding the shape to the new container was not successful | status code: ${addShapeResponse.status}`);
    }
    console.log(`Shape validation added to ${this.ldes.root + newContainerName}/`);

    // change inbox header in root container .meta
    // TODO: move together with adding shapevalidation
    const updateInboxResponse = await this.ldes.updateInbox(newContainerName);
    if (updateInboxResponse.status !== 205) {
      throw Error(`Updating the inbox was not successful | Status code: ${updateInboxResponse.status}`);
    }
    console.log(`${this.ldes.root + newContainerName}/ is now the inbox.`);

    // update relation in root.ttl
    const addRelationResponse = await this.ldes.addRelation(newContainerName);
    if (addRelationResponse.status !== 205) {
      throw Error(`Updating the LDES root was not successful | Status code: ${addRelationResponse.status}`);
    }
    console.log(`${this.ldes.root}root.ttl is updated with a new relation to ${newContainerIRI}`);

    console.log(`Orchestrating succeeded: new container can be found at ${this.ldes.root}${newContainerName}/`);
  }
}
