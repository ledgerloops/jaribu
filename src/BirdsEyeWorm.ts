import { EventEmitter } from 'node:events';
import { Graph } from './BirdsEyeGraph.js';
import { appendFile } from 'node:fs/promises';

const MAX_NUM_STEPS = 1000000;

export class Worm extends EventEmitter {
  graph: Graph;
  stats: {
    [loopLength: number]: {
      numFound: number;
      totalAmount: number;
    };
  } = {};
  path: string[];
  counter: number = 0;
  fromNode: string;
  private solutionFile: string;
  constructor(fromNode: string, graph: Graph, solutionFile: string) {
    super();
    this.graph = graph;
    this.fromNode = fromNode;
    this.solutionFile = solutionFile;
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
      // this.report(2, amountNetted);
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
    // this.report(loop.length - 1, smallestWeight);
    return smallestWeight;
  }
  async work(): Promise<void> {
    const path = [];
    let newStep = this.graph.getFirstOutgoingNode(this.fromNode);
    while (this.counter++ < MAX_NUM_STEPS) {
      // console.log('Step', path, newStep);
      path.push(newStep);
      // console.log('picking first option from', newStep);
      // console.log(path);
      const backtracked = [];
      while (
        path.length > 0 &&
        !this.graph.hasOutgoingLinks(path[path.length - 1])
      ) {
        // console.log('no outgoing links', path);
        // backtrack
        const previousStep = path.pop();
        backtracked.push(previousStep);
        if (path.length > 0) {
          this.graph.removeLink(path[path.length - 1], previousStep);
        }
      }
      // we now know that either newStep has outgoing links, or path is empty
      if (path.length === 0) {
        if (backtracked.length > 0) {
          // this.printLine('finished   ', path, backtracked.reverse());
        }
        // no paths left, return
        return;
      } else {
        if (backtracked.length > 0) {
          // this.printLine('backtracked', path, backtracked.reverse());
          newStep = path[path.length - 1];
          // console.log('continuing from', path, newStep);
        }
        newStep = this.graph.getFirstOutgoingNode(newStep);
        // console.log('considering', path, newStep);
      }
      // check for loops in path
      const pos = path.indexOf(newStep);
      if (pos !== -1) {
        const loop = path.splice(pos).concat(newStep);
        const smallestWeight = this.netLoop(loop);
        // this.printLine(`found loop `, path, loop);
        if (this.solutionFile) {
          await appendFile(
            this.solutionFile,
            loop
              .slice(0, loop.length - 1)
              .concat(smallestWeight)
              .join(' ') + '\n',
          );
        }

        if (path.length === 0) {
          // console.log('we are done here');
          return;
        }
        newStep = this.graph.getFirstOutgoingNode(path[path.length - 1]);
        // console.log(`Continuing with`, path, newStep);
      }
    }
    return;
  }
}
