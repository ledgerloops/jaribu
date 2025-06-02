import { getDebtGraph, DebtGraph } from './readDebtFile.js';
type Task = {
  node: string;
  command: string;
  args: string[];
};

class Jaribu {
  name: string;
  sendTask: (t: Task) => void;
  outgoing: string[] = [];
  incoming: string[] = [];
  constructor(name: string, sendTask: (t: Task) => void) {
    this.name = name;
    this.sendTask = sendTask;
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
      this.sendTask({
        node: this.outgoing[0],
        command: 'probe',
        args: args.concat(this.name)
      });
    }
  }
}

class Network {
  debt: DebtGraph;
  tasks: Task[] = [];
  nodes: { [name: string]: Jaribu } = {}
  ensureNode(name: string): void {
    if (typeof this.nodes[name] === 'undefined') {
      this.nodes[name] = new Jaribu(name, (task: Task) => {
        // console.log(`Adding task from ${name}`, task);
        this.tasks.push(task);
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
          this.tasks.push({ node: to, command: 'probe', args: [ from, to ] });
        }
      });
    });
  } 
  async init(): Promise<void> {
    this.debt = await getDebtGraph();
    await this.createInitialTasks();
  }
  async runTasks(): Promise<void> {
    for(let i = 0; i < this.tasks.length; i++) {
      if (i % 100000 === 0) {
        console.log(`Task ${i} of ${this.tasks.length}`);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      this.nodes[this.tasks[i].node].execute(this.tasks[i].command, this.tasks[i].args);
    }
  }
}
// ...
const jaribu = new Network();
await jaribu.init();
await jaribu.runTasks();
