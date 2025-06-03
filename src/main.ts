import { getDebtGraph, DebtGraph } from './readDebtFile.js';

type Probe = {
  nodes: string[];
};

type Message = {
  to: string;
  command: string;
  args: string[]
};

const CHUNK_SIZE = 1000;

class Jaribu {
  name: string;
  currentProbe: string | undefined = undefined;
  sendMessage: (m: Message) => void;
  outgoing: string[] = [];
  incoming: string[] = [];
  constructor(name: string, sendMessage: (t: Message) => void) {
    this.name = name;
    this.sendMessage = sendMessage;
  }
  ensureIncoming(from: string): void {
    if (this.incoming.indexOf(from) === -1) {
      this.incoming.push(from);
    }
  }
  ensureOutgoing(to: string): void {
    if (this.outgoing.indexOf(to) === -1) {
      this.outgoing.push(to);
    }
  }
}

class Network {
  debt: DebtGraph;
  probes: { [probeId: string]: Probe } = {};
  nodes: { [name: string]: Jaribu } = {};
  addHop(name: string, probeId: string): void {
    if (this.nodes[name].outgoing.length > 0) {
      // console.log('addHop', probeId, this.probes[probeId].nodes, this.nodes[name].outgoing[0]);
      this.probes[probeId].nodes.push(this.nodes[name].outgoing[0]);
    }
  }
  maybeAddHop(name: string, probeId: string): void {
    if (this.nodes[name].currentProbe === undefined) {
      this.nodes[name].currentProbe = probeId;
      this.addHop(name, probeId); 
    } else {
      console.log(`Not adding hop (busy with ${this.nodes[name].currentProbe})`, probeId, this.probes[probeId].nodes, this.nodes[name].outgoing[0]);
    }
  }
  ensureNode(name: string): void {
    if (typeof this.nodes[name] === 'undefined') {
      this.nodes[name] = new Jaribu(name, () => {
      });
    }
  }
  ensureLink(from: string, to: string): void {
    this.ensureNode(from);
    this.ensureNode(to);
    this.nodes[from].ensureOutgoing(to);
    this.nodes[to].ensureIncoming(from);
  }
  async createInitialTasks(): Promise<void> {
    Object.keys(this.debt).forEach(from => {
      Object.keys(this.debt[from]).forEach(to => {
        if (typeof this.debt[to] !== 'undefined') {
          this.ensureLink(from, to);
          // for every link that enters a node that has at least one exit link,
          // create a probe task.
          this.probes[`${from}-${to}`] = { nodes: [ from, to ] };
        }
      });
    });
  } 
  async init(): Promise<void> {
    this.debt = await getDebtGraph();
    await this.createInitialTasks();
  }
  async runTasks(): Promise<void> {
    while (Object.keys(this.probes).length > 0) {
      for(let i = 0; i < Object.keys(this.probes).length && i < CHUNK_SIZE; i++) {
        // console.log('doing task', i);
        const probeId = Object.keys(this.probes)[i];
        const nodes = this.probes[probeId].nodes;
        const lastHop = nodes[nodes.length - 1];
        this.maybeAddHop(lastHop, probeId);
      }
      console.log(`Another ${CHUNK_SIZE} tasks done of ${Object.keys(this.probes).length}`);
      await new Promise(resolve => setTimeout(resolve, 0)); // I think this helps node obey Ctrl-C interrupts
    }
  }
}
// ...
const jaribu = new Network();
await jaribu.init();
await jaribu.runTasks();
