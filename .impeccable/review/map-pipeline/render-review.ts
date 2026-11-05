import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';import {resolve} from 'node:path';
import {loadMapInputs,mapObservations,METRICS} from '../../../server/services/map-pipeline/sources.ts';
import {buildMapTheme} from '../../../server/services/map-pipeline/theme.ts';
import {renderMapVideo} from '../../../server/services/map-pipeline/render.ts';
const source='/home/davtian/Documents/map';const directory=resolve(source,'exports/review/forest-180s-20261029');await mkdir(directory,{recursive:true});
const state=JSON.parse(await readFile('data/output/map-pipeline/state.json','utf8'));const idea=state.jobs.find(j=>j.id==='39567d04-01a6-40eb-bb4f-a465468df5e9').idea;
const snapshot=JSON.parse(await readFile('data/output/map-pipeline/source-checks/forest/source.json','utf8'));await writeFile(resolve(directory,'source.json'),JSON.stringify(snapshot,null,2));
const metric=METRICS.find(m=>m.id==='forest')!;const {template,meta}=await loadMapInputs(source);const ids=[...new Set<string>(template.reveals.flatMap(r=>r.countries))];const observations=mapObservations(ids,meta,snapshot.byIso3,metric.year);const theme=buildMapTheme(template,meta,observations,metric,idea,'forest-review-180');await writeFile(resolve(directory,'theme.json'),JSON.stringify(theme,null,2));
const result=await renderMapVideo({source,built:resolve('data/map-studio'),directory,theme,idea,metric,signal:AbortSignal.timeout(4*3600000),stage:async text=>{console.log(text)}});await writeFile(resolve(directory,'metadata.json'),JSON.stringify({title:idea.title,metric,source:snapshot.url,seconds:result.seconds,approval:'pending',publishingAllowed:false},null,2));console.log(JSON.stringify(result));
