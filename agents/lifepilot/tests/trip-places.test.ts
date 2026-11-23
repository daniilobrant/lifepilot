import assert from 'node:assert/strict'
import {test} from 'node:test'
import {searchTripPlaces} from '../../../hub/connectors/trip-places.ts'

test('Travel autocomplete combines named islands with geocoded cities and caches the provider result',async context=>{
  const lookup=context.mock.method(globalThis,'fetch',async (url:URL)=>{
    assert.equal(url.origin,'https://geocoding-api.open-meteo.com')
    assert.equal(url.searchParams.get('name'),'Tenerife')
    return Response.json({results:[
      {name:'Santa Cruz de Tenerife',country:'Spanien',admin1:'Kanarische Inseln',feature_code:'PPLA'},
      {name:'Teneriffa',country:'Spanien',admin1:'Kanarische Inseln',feature_code:'ISL'},
      {name:'Ein Hotel',country:'Spanien',feature_code:'HTL'},
    ]})
  })
  const results=await searchTripPlaces('Tenerife',false)
  assert.deepEqual(results.map(place=>[place.name,place.country,place.kind]),[
    ['Teneriffa','Spanien','island'],['Santa Cruz de Tenerife','Spanien','city'],
  ])
  assert.deepEqual((await searchTripPlaces('Tenerife',true)).map(place=>place.name),['Santa Cruz de Tenerife'])
  assert.equal(lookup.mock.callCount(),1)
})

test('Known islands stay available during a provider outage and manual entry remains possible',async context=>{
  context.mock.method(globalThis,'fetch',async()=>{throw Error('offline')})
  assert.equal((await searchTripPlaces('Mallor',false))[0].country,'Spanien')
  await assert.rejects(searchTripPlaces('Lissabon',true),{status:503})
  assert.deepEqual(await searchTripPlaces('L',true),[])
  await assert.rejects(searchTripPlaces('Bad\nCity',true),{status:400})
})
