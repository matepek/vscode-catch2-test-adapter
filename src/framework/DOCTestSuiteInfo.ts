// import * as fs from 'fs';
// import { inspect, promisify } from 'util';
// import { TestEvent } from 'vscode-test-adapter-api';
// import * as xml2js from 'xml2js';

// import { DOCTestInfo } from './DOCTestInfo';
// import * as c2fs from '../FSWrapper';
// import { AbstractTestSuiteInfo } from '../AbstractTestSuiteInfo';
// import { AbstractTestSuiteInfoBase } from '../AbstractTestSuiteInfoBase';
// import { SharedVariables } from '../SharedVariables';
// import { RunningTestExecutableInfo, ProcessResult } from '../RunningTestExecutableInfo';

// interface XmlObject {
//   [prop: string]: any; //eslint-disable-line
// }

// class DOCTestGroupSuiteInfo extends AbstractTestSuiteInfoBase {
//   public children: DOCTestInfo[] = [];

//   public constructor(shared: SharedVariables, label: string, id?: string) {
//     super(shared, label, undefined, id);
//   }

//   public addChild(test: DOCTestInfo): void {
//     super.addChild(test);
//   }
// }

// export class DOCTestSuiteInfo extends AbstractTestSuiteInfo {
//   public children: (DOCTestGroupSuiteInfo | DOCTestInfo)[] = [];

//   public constructor(
//     shared: SharedVariables,
//     label: string,
//     desciption: string | undefined,
//     execPath: string,
//     execOptions: c2fs.SpawnOptions,
//     private _docVersion: [number, number, number] | undefined,
//   ) {
//     super(shared, label, desciption, execPath, execOptions);
//   }

//   protected _reloadChildren(): Promise<void> {
//     this._shared.log.info('reloadChildren', this.label, this._docVersion);
//     return this._reloadDOCTests();
//   }

//   private _reloadFromString(testListOutput: string, oldChildren: (DOCTestGroupSuiteInfo | DOCTestInfo)[]): void {
//     let lines = testListOutput.split(/\r?\n/);

//     while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();

//     lines.shift(); // first line: 'Matching test cases:'
//     lines.pop(); // last line: '[0-9]+ matching test cases'

//     for (let i = 0; i < lines.length; ) {
//       if (!lines[i].startsWith('  ')) this._shared.log.error('Wrong test list output format: ' + lines.toString());

//       if (lines[i].startsWith('    ')) {
//         this._shared.log.warn('Probably too long test name', lines);
//         this.children = [];
//         const test = this.addChild(
//           new DOCTestInfo(this._shared, undefined, 'Check the test output message for details ⚠️', '', [], '', 0),
//         );
//         this._shared.sendTestEventEmitter.fire([
//           {
//             type: 'test',
//             test: test,
//             state: 'errored',
//             message: [
//               '⚠️ Probably too long test name or the test name starts with space characters!',
//               '🛠 - Try to define `CATCH_CONFIG_CONSOLE_WIDTH 300` before `doc.hpp` is included.',
//               '🛠 - Remove whitespace characters from the beggining of test "' + lines[i].substr(2) + '"',
//             ].join('\n'),
//           },
//         ]);
//         return;
//       }
//       const testNameAsId = lines[i++].substr(2);

//       let filePath = '';
//       let line = 1;
//       {
//         const fileLine = lines[i++].substr(4);
//         const match = fileLine.match(/(?:(.+):([0-9]+)|(.+)\(([0-9]+)\))/);

//         if (match && match.length == 5) {
//           const matchedPath = match[1] ? match[1] : match[3];
//           filePath = this._findFilePath(matchedPath);
//           line = Number(match[2] ? match[2] : match[4]);
//         }
//       }

//       let description = lines[i++].substr(4);
//       if (description.startsWith('(NO DESCRIPTION)')) description = '';

//       let tags: string[] = [];
//       if (i < lines.length && lines[i].length > 6 && lines[i][6] === '[') {
//         tags = lines[i].trim().split(']');
//         tags.pop();
//         for (let j = 0; j < tags.length; ++j) tags[j] += ']';
//         ++i;
//       }

//       const index = oldChildren.findIndex(c => c.testNameAsId == testNameAsId);

//       this.addChild(
//         new DOCTestInfo(
//           this._shared,
//           index != -1 ? oldChildren[index].id : undefined,
//           testNameAsId,
//           description,
//           tags,
//           filePath,
//           line - 1,
//           index != -1 ? oldChildren[index].sections : undefined,
//         ),
//       );
//     }
//   }

//   private async _reloadDOCTests(): Promise<void> {
//     const oldChildren = this.children;
//     this.children = [];
//     this.label = this.origLabel;

//     try {
//       // if we wanna group the suites we need more steps TODO

//       const cases = await c2fs
//         .spawnAsync(this.execPath, ['--list-test-cases', '--no-colors=true'], this.execOptions, 30000)
//         .then(output => {
//           if (output.stderr) throw Error(output.stderr);

//           if (output.stdout.length < 3) throw Error('Output error:' + output.stdout);
//           if (!output.stdout[0].startsWith('[doctest] listing all test case names')) throw Error('TODO');
//           const delimiter = '=================================';
//           if (!output.stdout[1].startsWith(delimiter)) throw Error('TODO');

//           const cases: string[] = [];

//           {
//             let i = 2;
//             while (output.stdout.length < i && !output.stdout[i].startsWith(delimiter)) {
//               ++i;
//             }

//             if (output.stdout.length >= i) throw Error('Output error:' + output.stdout);
//             if (!output.stdout[i].startsWith(delimiter)) throw Error('TODO');
//           }

//           cases.forEach(x => {
//             //this.addChild(new DOCTestInfo());
//           });
//         });
//     } catch (e) {
//       this._shared.log.warn('reloadChildren -> docTestListOutput.stderr', e);
//       const test = this.addChild(
//         new DOCTestInfo(this._shared, undefined, 'Check the test output message for details ⚠️', '', [], '', 0),
//       );
//       this._shared.sendTestEventEmitter.fire([{ type: 'test', test: test, state: 'errored', message: e.toString() }]);
//     }

//     // return c2fs
//     //   .spawnAsync(
//     //     this.execPath,
//     //     ['[.],*', '--verbosity', 'high', '--list-tests', '--use-colour', 'no'],
//     //     this.execOptions,
//     //     30000,
//     //   )
//     //   .then(docTestListOutput => {
//     //     if (docTestListOutput.stderr) {
//     //       this._shared.log.warn('reloadChildren -> docTestListOutput.stderr', docTestListOutput);
//     //       const test = this.addChild(
//     //         new DOCTestInfo(this._shared, undefined, 'Check the test output message for details ⚠️', '', [], '', 0),
//     //       );
//     //       this._shared.sendTestEventEmitter.fire([
//     //         { type: 'test', test: test, state: 'errored', message: docTestListOutput.stderr },
//     //       ]);
//     //       return Promise.resolve();
//     //     }

//     //     this._reloadFromString(docTestListOutput.stdout, oldChildren);

//     //     if (this._shared.enabledTestListCaching) {
//     //       return promisify(fs.writeFile)(cacheFile, docTestListOutput.stdout).catch(err =>
//     //         this._shared.log.warn('couldnt write cache file:', err),
//     //       );
//     //     }
//     //     return Promise.resolve();
//     //   });
//   }

//   protected _getRunParams(childrenToRun: 'runAllTestsExceptSkipped' | Set<DOCTestInfo>): string[] {
//     const execParams: string[] = [];

//     if (childrenToRun !== 'runAllTestsExceptSkipped') {
//       const testNames = [...childrenToRun].map(c => c.getEscapedTestName());
//       execParams.push(testNames.join(',')); //TODO
//     }

//     execParams.push('--reporters=xml');

//     execParams.push('--no-throw=' + (this._shared.isNoThrow ? 'true' : 'false'));

//     if (this._shared.rngSeed !== null) {
//       execParams.push('--rand-seed=' + this._shared.rngSeed.toString());
//     }

//     return execParams;
//   }

//   protected _handleProcess(runInfo: RunningTestExecutableInfo): Promise<void> {
//     const data = new (class {
//       public buffer: string = '';
//       public inTestCase: boolean = false;
//       public currentChild: DOCTestInfo | undefined = undefined;
//       public beforeFirstTestCase: boolean = true;
//       public rngSeed: number | undefined = undefined;
//       public unprocessedXmlTestCases: string[] = [];
//       public processedTestCases: DOCTestInfo[] = [];
//     })();

//     const testCaseTagRe = /<TestCase(?:\s+[^\n\r]+)?>/;

//     return new Promise<ProcessResult>(resolve => {
//       const processChunk = (chunk: string): void => {
//         data.buffer = data.buffer + chunk;
//         let invariant = 99999;
//         do {
//           if (!data.inTestCase) {
//             const b = data.buffer.indexOf('<TestCase');
//             if (b == -1) return;

//             const m = data.buffer.match(testCaseTagRe);
//             if (m == null || m.length != 1) return;

//             data.inTestCase = true;

//             let name = '';
//             new xml2js.Parser({ explicitArray: true }).parseString(
//               m[0] + '</TestCase>',
//               (err: Error, result: XmlObject) => {
//                 if (err) {
//                   this._shared.log.exception(err);
//                   throw err;
//                 } else {
//                   name = result.TestCase.$.name;
//                 }
//               },
//             );

//             if (data.beforeFirstTestCase) {
//               const ri = data.buffer.match(/<Randomness\s+seed="([0-9]+)"\s*\/?>/);
//               if (ri != null && ri.length == 2) {
//                 data.rngSeed = Number(ri[1]);
//               }
//             }

//             data.beforeFirstTestCase = false;
//             data.currentChild = this.children.find((v: DOCTestInfo) => {
//               // xml output trimmes the name of the test
//               return v.testNameAsId.trim() == name;
//             });

//             if (data.currentChild !== undefined) {
//               this._shared.log.info('Test', data.currentChild.testNameAsId, 'has started.');
//               this._shared.testStatesEmitter.fire(data.currentChild.getStartEvent());
//             } else {
//               this._shared.log.info('TestCase not found in children', name);
//             }

//             data.buffer = data.buffer.substr(b);
//           } else {
//             const endTestCase = '</TestCase>';
//             const b = data.buffer.indexOf(endTestCase);
//             if (b == -1) return;

//             const testCaseXml = data.buffer.substring(0, b + endTestCase.length);

//             if (data.currentChild !== undefined) {
//               this._shared.log.info('Test ', data.currentChild.testNameAsId, 'has finished.');
//               try {
//                 const ev: TestEvent = data.currentChild.parseAndProcessTestCase(testCaseXml, data.rngSeed, runInfo);
//                 data.processedTestCases.push(data.currentChild);
//                 this._shared.testStatesEmitter.fire(ev);
//               } catch (e) {
//                 this._shared.log.error('parsing and processing test', e, data, testCaseXml);
//                 this._shared.testStatesEmitter.fire({
//                   type: 'test',
//                   test: data.currentChild,
//                   state: 'errored',
//                   message: '😱 Unexpected error under parsing output !! Error: ' + inspect(e) + '\n',
//                 });
//               }
//             } else {
//               this._shared.log.info('<TestCase> found without TestInfo: ', this, '; ', testCaseXml);
//               data.unprocessedXmlTestCases.push(testCaseXml);
//             }

//             data.inTestCase = false;
//             data.currentChild = undefined;
//             data.buffer = data.buffer.substr(b + endTestCase.length);
//           }
//         } while (data.buffer.length > 0 && --invariant > 0);
//         if (invariant == 0) {
//           this._shared.log.error('invariant==0', this, runInfo, data);
//           resolve({ error: new Error('Possible infinite loop of this extension') });
//           runInfo.killProcess();
//         }
//       };

//       runInfo.process!.stdout!.on('data', (chunk: Uint8Array) => processChunk(chunk.toLocaleString()));
//       runInfo.process!.stderr!.on('data', (chunk: Uint8Array) => processChunk(chunk.toLocaleString()));

//       runInfo.process!.once('close', (code: number | null, signal: string | null) => {
//         if (code !== null && code !== undefined) resolve(ProcessResult.createFromErrorCode(code));
//         else if (signal !== null && signal !== undefined) resolve(ProcessResult.createFromSignal(signal));
//         else resolve({ error: new Error('unknown sfngvdlfkxdvgn') });
//       });
//     })
//       .catch((reason: Error) => {
//         // eslint-disable-next-line
//         if ((reason as any).code === undefined) this._shared.log.exception(reason);

//         return { error: reason };
//       })
//       .then((result: ProcessResult) => {
//         result.error && this._shared.log.info(result.error.toString(), result, runInfo, this, data);

//         if (data.inTestCase) {
//           if (data.currentChild !== undefined) {
//             this._shared.log.info('data.currentChild !== undefined: ', data);
//             let ev: TestEvent;

//             if (runInfo.timeout !== null) {
//               ev = data.currentChild.getTimeoutEvent(runInfo.timeout);
//             } else {
//               ev = data.currentChild.getFailedEventBase();

//               ev.message = '😱 Unexpected error !!';

//               if (result.error) {
//                 ev.state = 'errored';
//                 ev.message += '\n' + result.error.message;
//               }

//               ev.message += runInfo.stderr ? '\n' + runInfo.stderr : '';
//             }

//             data.currentChild.lastRunState = ev.state;
//             this._shared.testStatesEmitter.fire(ev);
//           } else {
//             this._shared.log.warn('data.inTestCase: ', data);
//           }
//         }

//         const isTestRemoved =
//           runInfo.timeout === null &&
//           result.error === undefined &&
//           ((runInfo.childrenToRun === 'runAllTestsExceptSkipped' &&
//             this.getTestInfoCount(false) > data.processedTestCases.length) ||
//             (runInfo.childrenToRun !== 'runAllTestsExceptSkipped' && data.processedTestCases.length == 0));

//         if (data.unprocessedXmlTestCases.length > 0 || isTestRemoved) {
//           new Promise<void>((resolve, reject) => {
//             this._shared.loadWithTaskEmitter.fire(() => {
//               return this.reloadTests(this._shared.taskPool).then(resolve, reject);
//             });
//           }).then(
//             () => {
//               // we have test results for the newly detected tests
//               // after reload we can set the results
//               const events: TestEvent[] = [];

//               for (let i = 0; i < data.unprocessedXmlTestCases.length; i++) {
//                 const testCaseXml = data.unprocessedXmlTestCases[i];

//                 const m = testCaseXml.match(testCaseTagRe);
//                 if (m == null || m.length != 1) break;

//                 let name: string | undefined = undefined;
//                 new xml2js.Parser({ explicitArray: true }).parseString(
//                   m[0] + '</TestCase>',
//                   (err: Error, result: XmlObject) => {
//                     if (err) {
//                       this._shared.log.exception(err);
//                     } else {
//                       name = result.TestCase.$.name;
//                     }
//                   },
//                 );
//                 if (name === undefined) break;

//                 const currentChild = this.children.find((v: DOCTestInfo) => {
//                   // xml output trimmes the name of the test
//                   return v.testNameAsId.trim() == name;
//                 });
//                 if (currentChild === undefined) break;

//                 try {
//                   const ev = currentChild.parseAndProcessTestCase(testCaseXml, data.rngSeed, runInfo);
//                   events.push(ev);
//                 } catch (e) {
//                   this._shared.log.error('parsing and processing test: ' + testCaseXml);
//                 }
//               }
//               events.length && this._shared.sendTestEventEmitter.fire(events);
//             },
//             (reason: Error) => {
//               // Suite possibly deleted: It is a dead suite.
//               this._shared.log.error('reloading-error: ', reason);
//             },
//           );
//         }
//       });
//   }

//   public addChild(test: DOCTestInfo): DOCTestInfo {
//     super.addChild(test);
//     return test;
//   }
// }
