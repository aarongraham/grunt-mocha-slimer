module.exports = function (grunt) {
	'use strict';

	var path = require('path');
	var events = require('events');

	var wrapper = require('../lib/wrapper');
	var helper = require('../lib/helper');

	function multi(data, sep) {
		if (typeof data !== 'string') {
			return data;
		}
		return sep + String(data).split(/\r?\n/g).join('\n' + sep);
	}

	grunt.registerMultiTask('mocha_slimer', 'Run mocha in slimerjs', function () {
		var options = this.options({
			urls: [],
			timeout: 10000,
			ui: 'bdd',
			run: true,
			mocha: {},
			reporter: 'Spec'
		});
		var done = this.async();

		var params = {
			timeout: options.timeout,
			cwd: process.cwd(),
			tests: this.filesSrc.reduce(function (memo, src) {
				if (/^https?:\/\//.test(src)) {
					memo.push(src);
				}
				memo.push(path.resolve(process.cwd(), src));
				return memo;
			}, options.urls),
			options: {
				ui: options.ui,
				run: options.run,
				mocha: options.mocha
			}
		};

		var slimer = wrapper.create(params);

		var runner = new events.EventEmitter();

		var suites = [];
		var stats = [];

		var Reporter = helper.getReporter(options.reporter);
		if (Reporter === null) {
			grunt.fatal('Specified reporter is unknown or unresolvable: ' + options.reporter);
		}
		var reporter = new Reporter(runner);

		slimer.on('log', function (data) {
			console.log(multi(data, '> '));
		});

		slimer.on('error', function (error) {
			console.error(multi(error, '! '));
		});

		slimer.on('mocha', function (event) {
			if (event.type === 'end') {
				stats.push(event.data.stats);
			}

			var test = event.data;
			if (test) {
				var fullTitle = test.fullTitle;
				test.fullTitle = function () {
					return fullTitle;
				};
				var slow = this.slow;
				test.slow = function () {
					return slow;
				};
				test.parent = suites[suites.length - 1] || null;
			}

			if (event.type === 'suite') {
				suites.push(test);
			}
			else if (event.type === 'suite end') {
				suites.pop();
			}
			runner.emit(event.type, test, (test ? test.err : null));
		});

		var exitCode = 1;

		slimer.on('exit', function (data) {
			exitCode = data.code;
			if (exitCode !== 0) {
				console.log(multi(data.reason, '>> '));
			}
		});

		slimer.on('close', function () {

			var total = helper.reduceStats(stats);

			var report = '\n>> ';
			var str;

			str = 'failed ' + total.failures;
			report += (total.failures > 0 ? str.red : str.green);
			report += ' and ';

			str = 'passed ' + total.passes;
			report += (total.failures > 0 ? str.yellow : str.green);
			report += ' of ';

			str = total.tests + ' ' + (total.tests === 1 ? 'test' : 'tests');
			report += (total.tests ? str.cyan : str.red) + ' total';

			if (total.pending > 0) {
				report += ', left ';
				str = total.pending + ' pending';
				report += str.yellow;
			}

			report += ' (' + total.duration + 'ms)\n';

			grunt.log.writeln(report);

			if (exitCode !== 0) {
				grunt.log.warn('slimer exited with code ' + exitCode);
				done(false);
			}
			else if (total.failures > 0) {
				done(false);
			}
			else {
				done();
			}
		});
	});
};
