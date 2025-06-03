import { getDebtGraph, DebtGraph } from './readDebtFile.js';

type Probe = {
  nodes: string[];
};

type Message = {
  to: string;
  command: string;
  args: string[]
};

const CHUNK_SIZE = 1000 * 1000;

class Jaribu {
  name: string;
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
  async execute(command: string, args: string[]): Promise<void> {
    if (command !== 'probe') {
      throw new Error(`Unknown command ${command}`);
    }
    // console.log('executing', command, args, this.outgoing.length);
    if (this.outgoing.length > 0) {
      this.sendMessage({
        to: this.outgoing[0],
        command: 'probe',
        args: args.concat(this.outgoing[0])
      });
    }
  }
}

class Network {
  debt: DebtGraph;
  probes: { [probeId: string]: Probe } = {};
  nodes: { [name: string]: Jaribu } = {};
  validateMessage(name: string, message: Message): void {
    console.log(`Node ${name} sends ${message.command} message to ${message.to}`, message.args);
    if ((message.command === 'probe')
      && (message.args.length >= 4) // probeId, from, name, next
      && (name === message.args[message.args.length - 2])
      && (message.to === message.args[message.args.length - 1])) {
      const probeId = message.args[0];
      const newHops = message.args.slice(1);
      if (newHops.length != this.probes[probeId].nodes.length + 1) {
        throw new Error(`This probe message does not add exactly one hop to probe ${probeId}`);
      }
      for (let i = 0; i < this.probes[probeId].nodes.length; i++) {
        if (this.probes[probeId].nodes[i] !== newHops[i]) {
          throw new Error(`This probe message incorrectly copies hop ${i} from probe ${probeId}`);
        }
      }
      if (this.probes[probeId].nodes[this.probes[probeId].nodes.length - 1] === name) {
        this.probes[probeId] = { nodes: newHops };
      }
    }
  }
  handleMessage(name: string, message: Message): void {
    void name;
    // this.validateMessage(name, message);
    const probeId = message.args[0];
    const newHops = message.args.slice(1);
    this.probes[probeId] = { nodes: newHops };
  }
  ensureNode(name: string): void {
    if (typeof this.nodes[name] === 'undefined') {
      this.nodes[name] = new Jaribu(name, (message: Message) => {
        this.handleMessage(name, message);
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
        this.nodes[nodes[nodes.length - 1]].execute('probe', [probeId].concat(nodes));
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
