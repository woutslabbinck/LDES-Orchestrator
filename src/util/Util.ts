/***************************************
 * Title: Util
 * Description: utility methods
 * Author: Wout Slabbinck (wout.slabbinck@ugent.be)
 * Created on 16/12/2021
 *****************************************/
export function sleep(ms: number): Promise<any> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
