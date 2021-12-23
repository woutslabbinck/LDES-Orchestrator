import {Session} from "@rubensworks/solid-client-authn-isomorphic";
import {LDESinSolid} from "./LDESinSolid";

/***************************************
 * Title: Orchestrator
 * Description: Orchestrator class with methods to control it
 * Author: Wout Slabbinck (wout.slabbinck@ugent.be)
 * Created on 30/11/2021
 *****************************************/

export class Orchestrator {
  private session: Session;
  private running: boolean;

  constructor(session: Session) {
    this.session = session;
    this.running = false;
  }

  private sleep(ms: number): Promise<any> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public async orchestrateLDES(ldes: LDESinSolid): Promise<void>
  public async orchestrateLDES(ldes: LDESinSolid, interval: number): Promise<void>
  public async orchestrateLDES(ldes: LDESinSolid, interval?: number): Promise<void> {
    // default 5 minutes (or 300 seconds) time between execution
    this.running = true;
    const sleepTime = interval ? interval * 1000 : 300 * 1000;

    // eslint-disable-next-line no-constant-condition
    while (this.running) {
      await ldes.createNewContainer();
      await this.sleep(sleepTime);
    }
  }

  public stopOrchestrating(): void {
    this.running = false;
  }

}
