import { Graph } from './BirdsEyeGraph.js';
import { writeFile, appendFile } from 'node:fs/promises';

const MAX_NUM_STEPS = 1000000;
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
  private path: { [probeId: string]: string[] } = {};
  private newStep:  { [probeId: string]: string } = {};
  private numLoopsFound: number;
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
    // console.log('report', loopLength, amount);
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
    if (typeof this.currentProbe[node] !== 'undefined') {
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
  getNewStep(probeId: string, after?: string): string {
    if (typeof after === 'undefined') {
      after = this.path[probeId][this.path[probeId].length - 1];
    }
    const newStep = this.graph.getFirstNode(after);
    if((typeof this.currentProbe[newStep] !== 'undefined') && (this.currentProbe[newStep] !== probeId)){
      throw new Error('killing this worm as it hits another one');
    }
    return newStep;
  }
  async work1(probeId: string): Promise<boolean> {
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
        this.graph.removeLink(this.path[probeId][this.path[probeId].length - 1], previousStep);
      }
    }
    // we now now that either this.newStep[probeId] has outgoing links, or this.path[probeId] is empty
    if (this.path[probeId].length === 0) {
      if (backtracked.length > 0) {
        // this.printLine('finished   ', this.path[probeId], backtracked.reverse());
      }
      // no this.path[probeId]s left, start with a new worm
      return true;
    } else {
      if (backtracked.length > 0) {
        // this.printLine('backtracked', this.path[probeId], backtracked.reverse());
        this.newStep[probeId] = this.path[probeId][this.path[probeId].length - 1];
        // console.log('continuing from', this.path[probeId], this.newStep[probeId]);
      }
      this.newStep[probeId] = this.getNewStep(probeId, this.newStep[probeId]);
      // console.log('considering', this.path[probeId], this.newStep[probeId]);
    }
    return false;
  }
  async work2(probeId: string): Promise<void> {
    // check for loops in this.path[probeId]
    const pos = this.path[probeId].indexOf(this.newStep[probeId]);
    if (pos !== -1) {
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
      this.newStep[probeId] = this.getNewStep(probeId);
      // console.log(`Continuing with`, this.path[probeId], this.newStep[probeId]);
    }
  }
  // removes dead ends as it finds them.
  // nets loops as it finds them.
  async runWorms(): Promise<void> {
    this.numLoopsFound = 0;
    const progressPrinter = setInterval(() => {
      console.log(`Found ${this.numLoopsFound} loops so far`);
    }, 1000);
    if (this.solutionFile) {
      await writeFile(this.solutionFile, '');
    }
    let counter = 0;

    const probeIds =  ['the-worm'];
    probeIds.forEach(probeId => {
      this.path[probeId] = [];
      this.newStep[probeId] = this.graph.getFirstNode(); // TODO: randomize this
    });

    try {
      while (counter++ < MAX_NUM_STEPS) {
        for (let runner = 0; runner < probeIds.length; runner++) {
          const done = await this.work1(probeIds[runner]);
          if (done) {
            this.path[probeIds[runner]] = [];
            this.newStep[probeIds[runner]] = this.graph.getFirstNode(); // TODO: break out of the loop here
          }
        }
        for (let runner = 0; runner < probeIds.length; runner++) {
          await this.work2(probeIds[runner]);
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
