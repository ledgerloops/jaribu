import { randomBytes } from 'node:crypto';
import { Graph } from './BirdsEyeGraph.js';
import { writeFile, appendFile } from 'node:fs/promises';

const MAX_NUM_STEPS = 1000000;
const MAX_NUM_RUNNERS = 100;
const WORM_START_INTERVAL = parseInt(process.argv[2]);
console.log({ WORM_START_INTERVAL });
let longestLoop = [];
let longestLoopAmount = 0;

export function printLine(
  preface: string,
  first: string[],
  second: string[],
): void {
  const firstStr =
    first.length > 0 ? `[ ${first.map((x) => `'${x}'`).join(', ')} ]` : `[]`;
  const secondStr =
    second.length > 0 ? `[ ${second.map((x) => `'${x}'`).join(', ')} ]` : `[]`;
  console.log(`${preface} ${firstStr} ${secondStr}`);
}

export class BirdsEyeWorm {
  graph: Graph = new Graph();
  stats: {
    [loopLength: number]: {
      numFound: number;
      totalAmount: number;
    };
  } = {};
  private probeIds: string [] = [];
  private path: { [probeId: string]: string[] } = {};
  private newStep:  { [probeId: string]: string } = {};
  private numLoopsFound: number = 0;
  private numLinksRemoved: number = 0;
  private probingReport: boolean;
  private solutionFile: string;
  private currentProbe: { [node: string]: string } = {};
  constructor(probingReport: boolean, solutionFile?: string) {
    this.probingReport = probingReport;
    this.solutionFile = solutionFile;
  }
  printLine(preface: string, first: string[], second: string[]): void {
    if (this.probingReport) {
      printLine(preface, first, second);
    }
  }
  report(loopLength: number, amount: number): void {
    // if (loopLength > 2) {
    //   console.log('report', loopLength, amount);
    // }
    if (typeof this.stats[loopLength] === 'undefined') {
      this.stats[loopLength] = {
        numFound: 0,
        totalAmount: 0,
      };
    }
    this.stats[loopLength].numFound++;
    this.stats[loopLength].totalAmount += amount;
  }
  addTransfer(from: string, to: string, amount: number): number {
    const amountNetted = this.graph.addWeight(from, to, amount);
    if (amountNetted > 0) {
      // console.log(from, to, amount, amountNetted);
      this.report(2, amountNetted);
    }
    return amountNetted;
  }
  // assumes all loop hops exist
  getSmallestWeight(loop: string[]): number {
    let smallestWeight = Infinity;
    for (let k = 0; k < loop.length - 1; k++) {
      const thisWeight = this.graph.getWeight(loop[k], loop[k + 1]);
      // console.log(`Weight on loop from ${loop[k]} to ${loop[k+1]} is ${thisWeight}`);
      if (thisWeight < smallestWeight) {
        smallestWeight = thisWeight;
      }
    }
    return smallestWeight;
  }
  // assumes all loop hops exist
  netLoop(loop: string[]): number {
    // const before = this.graph.getTotalWeight();
    const smallestWeight = this.getSmallestWeight(loop);
    if (smallestWeight === 0) {
      return 0;
    }
    let firstZeroPos;
    for (let k = 0; k < loop.length - 1; k++) {
      if (
        this.graph.getWeight(loop[k], loop[k + 1]) === smallestWeight &&
        typeof firstZeroPos === 'undefined'
      ) {
        firstZeroPos = k;
      }
      this.addTransfer(loop[k + 1], loop[k], smallestWeight);
    }
    // const after = this.graph.getTotalWeight();
    // console.log('total graph weight reduced by', before - after);
    if (loop.length - 1 === 2) {
      console.log('reporting on loop', loop);
    }
    this.report(loop.length - 1, smallestWeight);
    if (loop.length > longestLoop.length) {
      longestLoop = loop;
      longestLoopAmount = smallestWeight;
    }
    return smallestWeight;
  }
  popPath(probeId: string): string {
    const popped = this.path[probeId].pop();
    if (this.currentProbe[popped] !== probeId) {
      throw new Error(`Popping node ${popped} who does not know that it is in probe ${probeId}`);
    }
    delete this.currentProbe[popped];
    return popped;
  }
  pushPath(probeId: string, node: string): void {
    if (this.hitsAnotherWorm(probeId, node)) {
      throw new Error(`Attempt to push node ${node} onto path ${probeId} but it is busy with ${this.currentProbe[node]}`);
    }
    this.path[probeId].push(node);
    this.currentProbe[node] = probeId;
  }
  splicePath(probeId: string, pos: number): string[] {
    const spliced = this.path[probeId].splice(pos);
    spliced.forEach((node: string): void => {
      if (this.currentProbe[node] !== probeId) {
        throw new Error(`Splicing node ${node} who does not know that it is in probe ${probeId}`);
      }
      delete this.currentProbe[node];
    });
    return spliced;
  }
  hitsAnotherWorm(probeId: string, newStep: string): boolean {
    return (typeof this.currentProbe[newStep] !== 'undefined') && (this.currentProbe[newStep] !== probeId);
  }
  getNewStep(probeId: string, after?: string): string {
    if (typeof after === 'undefined') {
      after = this.path[probeId][this.path[probeId].length - 1];
    }
    const newStep = this.graph.getFirstNode(after);
    if(this.hitsAnotherWorm(probeId, newStep)) {
      throw new Error('killing this worm as it hits another one');
    }
    // console.log('new step', probeId, after, newStep);
    return newStep;
  }
  killWorm(probeId: string): void {
    this.splicePath(probeId, 0);
    delete this.path[probeId];
    delete this.newStep[probeId];
    // console.log('worm should be gone now', this.currentProbe, this.path, this.newStep, probeId);
  }
  hasIdleOutgoingLinks(probeId: string, name: string): boolean {
    const outgoingNeighbourNames = this.graph.getOutgoingNeighbourNames(name);
    const idleOutgoingNeighbourNames = outgoingNeighbourNames.filter(name => !this.hitsAnotherWorm(probeId, name));
    return idleOutgoingNeighbourNames.length > 0;
  }
  async work1(probeId: string): Promise<boolean> {
    // check this before calling pushPath
    if(this.hitsAnotherWorm(probeId, this.newStep[probeId])) {
      // console.log('killing at the start of work1', this.currentProbe, this.newStep, probeId);
      this.killWorm(probeId);
      return true;
    }
    // console.log('Step', this.path[probeId], this.newStep[probeId]);
    this.pushPath(probeId, this.newStep[probeId]);
    // console.log('picking first option from', this.newStep[probeId]);
    // console.log(this.path[probeId]);
    const backtracked = [];
    while (
      this.path[probeId].length > 0 &&
      !this.graph.hasOutgoingLinks(this.path[probeId][this.path[probeId].length - 1])
    ) {
      // console.log('no outgoing links', this.path[probeId]);
      // backtrack
      const previousStep = this.popPath(probeId);
      backtracked.push(previousStep);
      if (this.path[probeId].length > 0) {
        this.numLinksRemoved++;
        this.graph.removeLink(this.path[probeId][this.path[probeId].length - 1], previousStep);
      }
    }
    // we now now that either this.newStep[probeId] has outgoing links, or this.path[probeId] is empty
    if (this.path[probeId].length === 0) {
      if (backtracked.length > 0) {
        // this.printLine('finished   ', this.path[probeId], backtracked.reverse());
      }
      // no this.path[probeId]s left, start with a new worm
      this.killWorm(probeId);
      return true;
    } else {
      if (backtracked.length > 0) {
        // this.printLine('backtracked', this.path[probeId], backtracked.reverse());
        this.newStep[probeId] = this.path[probeId][this.path[probeId].length - 1];
        // console.log('continuing from', this.path[probeId], this.newStep[probeId]);
      }
      //check this before calling getNewStep
      if(this.hitsAnotherWorm(probeId, this.graph.getFirstNode(this.newStep[probeId]))) {
        // console.log('killing halfway work1', this.currentProbe, this.newStep, probeId);
        this.killWorm(probeId);
        return true;
      }
      this.newStep[probeId] = this.getNewStep(probeId, this.newStep[probeId]);
      // console.log('considering', this.path[probeId], this.newStep[probeId]);
    }
    return false;
  }
  async work2(probeId: string): Promise<boolean> {
    // check for loops in this.path[probeId]
    const pos = this.path[probeId].indexOf(this.newStep[probeId]);
    if (pos !== -1) {
      // console.log('Splicing off loop', this.currentProbe, this.path, probeId, pos);
      const loop = this.splicePath(probeId, pos).concat(this.newStep[probeId]);
      const smallestWeight = this.netLoop(loop);
      // this.printLine(`found loop `, this.path[probeId], loop);
      this.numLoopsFound++;
      if (this.solutionFile) {
        await appendFile(
          this.solutionFile,
          loop
            .slice(0, loop.length - 1)
            .concat(smallestWeight.toString())
            .join(' ') + '\n',
        );
      }
      if (this.path[probeId].length === 0) {
        // console.log('Uh-oh, how can we continue from an empty path? Killing this worm in work2', this.currentProbe, this.path, this.newStep, probeId, pos);
        this.killWorm(probeId);
        return true;
      }
      // if (!this.graph.hasOutgoingLinks(this.path[probeId][this.path[probeId].length - 1])) {
      //   console.log('Uh-oh, this is going to crash', this.currentProbe, this.path, this.newStep, probeId, pos);
      // }
      this.newStep[probeId] = this.getNewStep(probeId);
      // console.log(`Continuing with`, this.path[probeId], this.newStep[probeId]);
    }
    return false;
  }
  newProbeId(): string {
    return randomBytes(8).toString("hex");
  }
  getBoredNodeWithOutgoingLinks(): string {
    const nodeNames = this.graph.getNodeNames();
    // return nodeNames[0];
    const boredNodes = nodeNames.filter(nodeName => (typeof this.currentProbe[nodeName] === 'undefined') && (this.graph.hasOutgoingLinks(nodeName)));
    const randomIndex = Math.floor(Math.random() * boredNodes.length);
    return boredNodes[randomIndex];
  }
  findEmptyRunner(): number {
    for (let runner = 0; runner < MAX_NUM_RUNNERS; runner++) {
      if (this.probeIds[runner] === undefined) {
        return runner;
      }
    }
    throw new Error('MAX_NUM_RUNNERS reached!');
  }
  // removes dead ends as it finds them.
  // nets loops as it finds them.
  async runWorms(): Promise<void> {
    let timer = 0;
    const progressPrinter = setInterval(() => {
      console.log(`Found ${this.numLoopsFound} loops and removed ${this.numLinksRemoved} links in ${++timer} seconds (now running ${this.probeIds.filter(x => x !== undefined).length} worms)`);
      // console.log(this.probeIds, this.path, this.newStep);
      if (timer === 90) {
        process.exit();
      }
    }, 1000);
    if (this.solutionFile) {
      await writeFile(this.solutionFile, '');
    }
    let counter = 0;

    setInterval(() => {
      const runner = this.findEmptyRunner();
      this.probeIds[runner] = this.newProbeId();
      this.path[this.probeIds[runner]] = [];
      this.newStep[this.probeIds[runner]] = this.getBoredNodeWithOutgoingLinks();
      // console.log(`start ${runner} ${this.probeIds[runner]}`, this.probeIds);
    }, WORM_START_INTERVAL);

    try {
      while (counter++ < MAX_NUM_STEPS) {
        await new Promise(resolve => setTimeout(resolve, 0));
        // console.log(`Loop for work1 (${counter})`, this.probeIds);
        for (let runner = 0; runner < MAX_NUM_RUNNERS; runner++) {
          if (this.probeIds[runner] === undefined) {
            continue;
          }
          // console.log(`work1 ${runner} ${this.probeIds[runner]}`)
          const done1 = await this.work1(this.probeIds[runner]);
          if (done1) {
            // console.log(`done1 ${runner} ${this.probeIds[runner]}`);
            delete this.probeIds[runner];
          }
        }
        // console.log(`Loop for work2 (${counter})`, this.probeIds);
        for (let runner = 0; runner < MAX_NUM_RUNNERS; runner++) {
          if (this.probeIds[runner] === undefined) {
            continue;
          }
          // console.log(`work2 ${runner} ${this.probeIds[runner]}`)
          const done2 = await this.work2(this.probeIds[runner]);
          if (done2) {
            // console.log(`done2 ${runner} ${this.probeIds[runner]}`);
            delete this.probeIds[runner];
          }
        }
      }
    } catch (e) {
      if (e.message === 'Graph is empty') {
        // We're done!
        console.log(`Done after ${counter} steps`);
        clearInterval(progressPrinter);
        console.log(
          longestLoop.join(' '),
          longestLoopAmount,
          longestLoop.length,
        );
        return;
      } else {
        throw e;
      }
    }
    clearInterval(progressPrinter);
    console.log(longestLoop.join(' '), longestLoopAmount, longestLoop.length);
  }
}
