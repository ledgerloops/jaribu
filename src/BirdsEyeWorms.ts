import { Graph } from './BirdsEyeGraph.js';
import { writeFile } from 'node:fs/promises';
import { Worm } from './BirdsEyeWorm.js';

const MAX_NUM_STEPS = 1000000;

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

export class BirdsEyeWorms {
  graph: Graph = new Graph();
  stats: {
    [loopLength: number]: {
      numFound: number;
      totalAmount: number;
    };
  } = {};
  private probingReport: boolean;
  private solutionFile: string;
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
      // this.report(2, amountNetted);
    }
    return amountNetted;
  }

  // removes dead ends as it finds them.
  // nets loops as it finds them.
  async runWorms(): Promise<void> {
    console.log('runWorms');
    if (this.solutionFile) {
      await writeFile(this.solutionFile, '');
    }
    let counter = 0;
    do {
      let startNode;
      try {
        startNode = this.graph.pickRandomNode(); // may throw
      } catch (e) {
        if (e.message === 'Graph is empty') {
          // We're done!
          console.log(`Done`);
          return;
        } else {
          throw e;
        }
      }
      // console.log(`Starting worm in node ${startNode}`);
      const worm = new Worm(startNode, this.graph, this.solutionFile);
      await worm.work();
      counter += worm.counter;
      // console.log('looping', counter, MAX_NUM_STEPS);
    } while (counter < MAX_NUM_STEPS);
  }
}
