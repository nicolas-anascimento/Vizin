import 'dotenv/config';
import pg from 'pg';
import {spawnSync} from 'node:child_process';
const source=new URL(process.env.DATABASE_URL!);
const name=`vizin_contract_test_audit_${Date.now()}`;
const admin=new pg.Client({connectionString:source.toString()});await admin.connect();
try{await admin.query(`CREATE DATABASE "${name}"`);}finally{await admin.end();}
source.pathname=`/${name}`;
const environment={...process.env,DATABASE_URL:source.toString(),TEST_DATABASE_URL:source.toString()};
console.log('Banco isolado:',name);
for(const args of [['exec','prisma','migrate','deploy'],['run','test:integration'],['exec','prisma','migrate','status']]) {
 const result=spawnSync('npm',args,{env:environment,stdio:'inherit'});
 if(result.status!==0)process.exit(result.status??1);
}
