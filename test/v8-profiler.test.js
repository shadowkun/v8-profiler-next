'use strict';

const expect = require('chai').expect;
const profiler = require('../');

const NODE_V_010 = /^v0\.10\.\d+$/.test(process.version);
const NODE_V_4 = /^v4\./.test(process.version);
const NODE_V_5 = /^v5\./.test(process.version);

describe('v8-profiler', function () {
  describe('CPU', function () {
    after(deleteAllProfiles);

    describe('Profiler', function () {

      it('should start profiling', function () {
        expect(profiler.startProfiling).to.not.throw();
      });

      it('should stop profiling', function () {
        expect(profiler.stopProfiling).to.not.throw();
      });

      it('should cache profiles', function () {
        expect(Object.keys(profiler.profiles)).to.have.length(1);
      });

      it('should delete profiles', function () {
        profiler.deleteAllProfiles();
        expect(Object.keys(profiler.profiles)).to.have.length(0);
      });

      it('should replace profile title, if started with name argument', function () {
        profiler.startProfiling('P');
        const profile = profiler.stopProfiling();
        expect(profile.title).to.equal('P');
      });

      it('should record samples, if started with recsamples argument', function () {
        if (NODE_V_010) return;

        profiler.startProfiling(true);
        const profile = profiler.stopProfiling();
        expect(profile.samples.length > 0).to.equal(true);
      });

      it('should throw on setSamplingInterval if profile recording in progress', function () {
        profiler.startProfiling();
        expect(profiler.setSamplingInterval).to.throw(
          'setSamplingInterval must be called when there are no profiles being recorded.');
        profiler.stopProfiling();
      });

      it('should set sampling interval', function () {
        profiler.setSamplingInterval(1000);
      });
    });

    describe('Profile', function () {
      it('should export itself with callback', function () {
        profiler.startProfiling('', true);
        const profile = profiler.stopProfiling();
        profile.export(function (error, result) {
          const _result = JSON.parse(result);

          expect(result).to.be.a('string');
          expect(_result).to.be.an('object');
        });
      });

      it('should export itself with stream', function (done) {
        profiler.startProfiling('', true);
        const profile = profiler.stopProfiling();
        const fs = require('fs'),
          ws = fs.createWriteStream('profile.json');
        profile.export().pipe(ws);

        ws.on('finish', function () {
          fs.unlink('profile.json', done);
        });
      });
    });

    function deleteAllProfiles() {
      Object.keys(profiler.profiles).forEach(function (key) {
        profiler.profiles[key].delete();
      });
    }
  });

  describe('HEAP', function () {
    after(deleteAllSnapshots);

    describe('Profiler', function () {

      it('should take snapshot without arguments', function () {
        expect(profiler.takeSnapshot).to.not.throw();
      });

      it('should cache snapshots', function () {
        expect(Object.keys(profiler.snapshots)).to.have.length(1);
      });

      it('should replace snapshot title, if started with name argument', function () {
        const snapshot = profiler.takeSnapshot('S');
        expect(snapshot.title).to.equal('S');
      });

      it('should write heap stats', function (done) {
        expect(profiler.startTrackingHeapObjects).to.not.throw();
        const lastSeenObjectId = profiler.getHeapStats(
          function (samples) {
            expect(samples).to.instanceof(Array);
          },
          function () {
            expect(profiler.stopTrackingHeapObjects).to.not.throw();
            done();
          }
        );
        expect(typeof lastSeenObjectId).to.be.equal('number');
      });

      it('should return undefined for wrong params in getObjectByHeapObjectId', function () {
        expect(profiler.getObjectByHeapObjectId('a')).to.be.equal(undefined);
      });

      it('should return id for object in getHeapObjectId', function () {
        const obj = {};
        const snapshot = profiler.takeSnapshot();
        expect(profiler.getHeapObjectId(obj)).to.be.gt(0);
      });

      it('should return id for undefined param in getHeapObjectId', function () {
        const snapshot = profiler.takeSnapshot();
        expect(profiler.getHeapObjectId(undefined)).to.be.gt(0);
      });

      it('should return undefined for wrong params in getHeapObjectId', function () {
        const snapshot = profiler.takeSnapshot();
        expect(profiler.getHeapObjectId()).to.be.equal(undefined);
      });
    });

    describe('Snapshot', function () {

      it('should delete itself from profiler cache', function () {
        const snapshot = profiler.takeSnapshot();
        const uid = snapshot.uid;

        const oldSnapshotsLength = Object.keys(profiler.snapshots).length;
        snapshot.delete();

        expect(Object.keys(profiler.snapshots).length == oldSnapshotsLength - 1).to.equal(true);
        expect(profiler.snapshots[uid]).to.be.equal(undefined);
      });

      it('should serialise itself', function (done) {
        const snapshot = profiler.takeSnapshot();
        let buffer = '';
        snapshot.serialize(
          function iterator(data, length) {
            buffer += data;
          },
          function callback() {
            expect(JSON.parse.bind(JSON, buffer)).to.not.throw();
            done();
          }
        );
      });

      it('should pipe itself to stream', function (done) {
        const snapshot = profiler.takeSnapshot();
        const fs = require('fs'),
          ws = fs.createWriteStream('snapshot.json')
            .on('finish', function () {
              fs.unlink('snapshot.json', done);
            });

        snapshot.export().pipe(ws);
      });

      it('should export itself to callback', function (done) {
        const snapshot = profiler.takeSnapshot();

        snapshot.export(function (err, result) {
          expect(!err);
          expect(typeof result == 'string');
          done();
        });
      });

      it('should compare itself with other snapshot', function () {
        this.timeout(5000);
        const snapshot1 = profiler.takeSnapshot();
        const snapshot2 = profiler.takeSnapshot();

        expect(snapshot1.compare.bind(snapshot1, snapshot2)).to.not.throw();
      });

      it('has expected structure', function (done) {
        const snapshot = profiler.takeSnapshot();
        snapshot.export(function (error, heap) {
          expect(!error);
          heap = JSON.parse(heap);
          const properties = ['snapshot', 'nodes', 'edges', 'samples', 'strings'];
          properties.forEach(function (prop) {
            expect(heap).to.have.property(prop);
          });
          const snapshotProperties = ['meta', 'node_count', 'edge_count'];
          snapshotProperties.forEach(function (prop) {
            expect(heap.snapshot).to.have.property(prop);
          });
          const metaProperties = ['node_fields', 'node_types', 'edge_fields', 'edge_types',
            'sample_fields'];
          metaProperties.forEach(function (prop) {
            expect(heap.snapshot.meta).to.have.property(prop);
          });
          done();
        });
      });
    });

    function deleteAllSnapshots() {
      Object.keys(profiler.snapshots).forEach(function (key) {
        profiler.snapshots[key].delete();
      });
    }
  });

  describe('SAMPLING HEAP', function () {
    describe('Profiler', function () {

      it('should start sampling heap profiling', function () {
        if (NODE_V_4 || NODE_V_5) {
          expect(profiler.startSamplingHeapProfiling).to.throw(
            'Sampling heap profiler needs node version >= node-v6.0.0!');
          return;
        }
        expect(profiler.startSamplingHeapProfiling).to.not.throw();
      });

      it('should stop sampling heap profiling', function () {
        if (NODE_V_4 || NODE_V_5) {
          expect(profiler.stopSamplingHeapProfiling).to.throw(
            'Sampling heap profiler needs node version >= node-v6.0.0!');
          return;
        }
        expect(profiler.stopSamplingHeapProfiling).to.not.throw();
      });

      it('has expected structure', function () {
        if (NODE_V_4 || NODE_V_5) return;
        profiler.startSamplingHeapProfiling();
        const profile = profiler.stopSamplingHeapProfiling();
        const samplingHeapProperties = ['head'];
        samplingHeapProperties.forEach(function (prop) {
          expect(profile).to.have.property(prop);
        });
        const samplingHeapNodeProperties = ['callFrame', 'selfSize', 'children'];
        samplingHeapNodeProperties.forEach(function (prop) {
          expect(profile.head).to.have.property(prop);
        });
        const samplingHeapFrameProperties = ['functionName', 'scriptId', 'url', 'lineNumber', 'columnNumber'];
        samplingHeapFrameProperties.forEach(function (prop) {
          expect(profile.head.callFrame).to.have.property(prop);
        });
      });
    });
  });
});
