import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const verifier = fileURLToPath(new URL('../../../scripts/verify-private-release.sh', import.meta.url))

test('The prelaunch verifier accepts an owner-signed complete release and rejects altered artifacts', () => {
  const temp=mkdtempSync(join(tmpdir(),'lifepilot-signature-test-'))
  const release=join(temp,'release'), keyPath=join(temp,'public.pem')
  const {privateKey, publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
  const files=['./.runtime/bin/node','./bin/lifepilot','./hub/adapters/cli.ts','./hub/runtime/server.ts',
    './dist/app.js','./dist/application-ocr','./dist/local-dictation','./dist/outfit-vision','./package-lock.json','./node_modules/demo/index.js']
  function verify() {
    const result=spawnSync('/bin/sh',[verifier,release,keyPath],{encoding:'utf8'})
    assert.ok(result.status===0||result.status===1,result.stderr)
    return result.status
  }
  try {
    writeFileSync(keyPath,publicKey.export({type:'spki',format:'pem'}))
    for (const file of files) {
      const path=join(release,file)
      mkdirSync(dirname(path),{recursive:true})
      writeFileSync(path,file)
    }
    const manifest=files.map(file=>createHash('sha256').update(file).digest('hex')+'  '+file).join('\n')+'\n'
    writeFileSync(join(release,'PRIVATE_RELEASE.sha256'),manifest)
    writeFileSync(join(release,'PRIVATE_RELEASE.sig'),sign('sha256',Buffer.from(manifest),privateKey))
    mkdirSync(join(release,'user-data'))
    writeFileSync(join(release,'user-data','fixture'), 'mutable')
    assert.equal(verify(),0)
    assert.equal(spawnSync('/bin/sh',[verifier,release,keyPath,'--require-admin-owned']).status,1)
    writeFileSync(join(release,'dist','application-ocr'),'changed')
    assert.equal(verify(),1)
    writeFileSync(join(release,'dist','application-ocr'),'./dist/application-ocr')
    const extra=join(release,'node_modules','demo','extra')
    writeFileSync(extra,'not in manifest')
    assert.equal(verify(),1)
    rmSync(extra)
    symlinkSync('index.js',extra)
    assert.equal(verify(),1)
    rmSync(extra)
    const other=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey
    writeFileSync(keyPath,other.export({type:'spki',format:'pem'}))
    assert.equal(verify(),1)
  } finally { rmSync(temp,{recursive:true,force:true}) }
})
