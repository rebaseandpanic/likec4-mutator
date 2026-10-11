/**
 * Spike 03: which deployment constructs LikeC4 1.59.4's validator accepts
 * (`likec4 validate` = every diagnostic of severity error).  One workspace per
 * case; prints the diagnostics (errors and warnings) of each.
 */
import { build } from './_lc4.mts';

const SPEC = `
specification {
  element service
  deploymentNode zone
  deploymentNode vm
  relationship calls
  tag t1
}
model {
  app = service {
    api = service {
      sub = service
    }
    db = service
  }
  other = service
}
`;

const one = (deployment: string): Record<string, string> => ({ 'm.c4': SPEC + `deployment {\n${deployment}\n}\n` });

const cases: Array<[string, Record<string, string>]> = [
  ['01 valid baseline', one(`zone prod {\n vm vm1 {\n instanceOf app.api\n instanceOf app.db\n }\n}`)],
  ['02 two unnamed instances of one element', one(`zone prod {\n instanceOf app.api\n instanceOf app.api\n}`)],
  ['03 unnamed + explicitly named "api" of one element', one(`zone prod {\n instanceOf app.api\n api = instanceOf app.api\n}`)],
  ['04 two named instances of one element', one(`zone prod {\n a1 = instanceOf app.api\n a2 = instanceOf app.api\n}`)],
  ['05 instance named like a sibling node', one(`zone prod {\n vm api\n instanceOf app.api\n}`)],
  ['06 same root node in two files', { 'a.c4': SPEC + `deployment { zone prod }`, 'b.c4': `deployment { zone prod }` }],
  ['07 node in extend body duplicating a base child', one(`zone prod {\n vm vm1\n}\nextend prod {\n vm vm1\n}`)],
  ['08 unknown node kind', one(`nosuch prod`)],
  ['09 instanceOf unresolved', one(`zone prod {\n instanceOf app.missing\n}`)],
  ['10 instanceOf by unique short name (api)', one(`zone prod {\n instanceOf api\n}`)],
  ['11 instanceOf nested short name (sub)', one(`zone prod {\n instanceOf sub\n}`)],
  ['12 relation endpoint is a model element FQN', one(`zone prod {\n instanceOf app.api\n}\nprod.api -> app.db`)],
  ['13 relation node -> own child instance', one(`zone prod {\n instanceOf app.api\n}\nprod -> prod.api`)],
  ['14 relation self', one(`zone prod {\n instanceOf app.api\n}\nprod.api -> prod.api`)],
  ['15 relation to nested element of an instance', one(`zone prod {\n instanceOf app.api\n instanceOf app.db\n}\nprod.db -> prod.api.sub`)],
  ['16 relation kind undeclared', one(`zone prod {\n instanceOf app.api\n instanceOf app.db\n}\nprod.api -[nosuch]-> prod.db`)],
  ['17 tag undeclared on node', one(`zone prod {\n #nosuch\n}`)],
  ['18 bidirectional <->', one(`zone prod {\n instanceOf app.api\n instanceOf app.db\n}\nprod.api <-> prod.db`)],
  ['19 sourceless relation in extend body', one(`zone prod {\n instanceOf app.api\n instanceOf app.db\n}\nextend prod {\n -> prod.db\n}`)],
  ['20 extend targeting an instance', one(`zone prod {\n instanceOf app.api\n}\nextend prod.api {\n #t1\n}`)],
  ['21 extend of unknown node', one(`extend nosuch {\n #t1\n}`)],
  ['22 extend of nested node', one(`zone prod {\n vm vm1\n}\nextend prod.vm1 {\n #t1\n}`)],
  ['23 relation between instances in different nodes', one(`zone prod {\n instanceOf app.api\n}\nzone dr {\n instanceOf app.db\n}\nprod.api -> dr.db`)],
  ['24 relation instance -> ancestor node', one(`zone prod {\n vm vm1 {\n instanceOf app.api\n }\n}\nprod.vm1.api -> prod`)],
  ['25 relative names inside a node body', one(`zone prod {\n vm vm1 {\n instanceOf app.api\n }\n vm vm2 {\n instanceOf app.db\n }\n vm1.api -> vm2.db\n api -> db\n}`)],
  ['26 this -> x inside node body', one(`zone prod {\n instanceOf app.api\n}\nzone dr {\n instanceOf app.db\n this -> prod.api\n}`)],
  ['27 sourceless relation in instance body', one(`zone prod {\n instanceOf app.db\n instanceOf app.api {\n -> db\n }\n}`)],
  ['28 reserved instance / node names', one(`zone prod {\n this = instanceOf app.api\n vm it\n}`)],
  ['29 relation with source inside extend body', one(`zone prod {\n instanceOf app.api\n instanceOf app.db\n}\nextend prod {\n api -> db\n}`)],
  ['30 empty extend and empty deployment', one(`zone prod\nextend prod {\n}`)],
  ['31 empty deployment block', one(``)],
  ['32 node kind named like an element kind', { 'm.c4': SPEC.replace('deploymentNode vm', 'deploymentNode service') + `deployment {\n service prod {\n instanceOf app.api\n }\n}\n` }],
  ['33 node with icon, style, metadata, link, all string props', one(`zone prod 'P' 'S' {\n #t1\n title 'T2'\n summary 'S2'\n description 'D'\n technology 'K'\n icon tech:kubernetes\n link https://example.com/x 'X'\n style {\n color red\n shape cylinder\n multiple true\n }\n metadata {\n owner 'ops'\n }\n}`)],
  ['34 instance with all props', one(`zone prod {\n api = instanceOf app.api 'T' 'S' {\n #t1\n description 'D'\n technology 'K'\n icon tech:go\n link https://example.com/y\n style { color blue }\n metadata { a 'b' }\n }\n}`)],
  ['35 relation with style', one(`zone prod {\n instanceOf app.api\n instanceOf app.db\n}\nprod.api -> prod.db {\n style {\n line dashed\n color red\n }\n}`) ],
  ['36 extend body with style / string property', one(`zone prod\nextend prod {\n title 'x'\n}`)],
  ['37 instance inside extend body', one(`zone prod {\n vm vm1\n}\nextend prod.vm1 {\n instanceOf app.api\n}\nprod.vm1.api -> prod`)],
  ['38 relation from node to instance in other node', one(`zone prod {\n instanceOf app.api\n}\nzone dr\ndr -> prod.api`)],
  ['39 relation tags on line and in body', one(`zone prod {\n instanceOf app.api\n instanceOf app.db\n}\nprod.api -> prod.db 'x' #t1 {\n #t1\n}`)],
  ['40 instance target is not an element (a node)', one(`zone prod\nzone dr {\n instanceOf prod\n}`)],
];

for (const [name, files] of cases) {
  const { diagnostics } = await build(files);
  console.log(`${name}: ${diagnostics.length === 0 ? 'OK (no diagnostics)' : JSON.stringify(diagnostics)}`);
}
