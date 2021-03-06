var StudentIndex = (function() {
	var index = {};

	var add = function(student, assignment, detector, cluster) {
		if(!index[student]) {
			index[student] = {};
		}

		var studentData = index[student];
		if(!studentData[assignment]) {
			studentData[assignment] = {};
		}

		var assignData = studentData[assignment];
		if(!assignData[detector]) {
			assignData[detector] = [];
		}

		var detectData = assignData[detector];
		if(detectData.indexOf(cluster) === -1) {
			detectData.push(cluster);
		}
	};

	var remove = function(student, assignment, detector, cluster) {
		if(index[student] && index[student][assignment] && index[student][assignment][detector]) {
			var clusters = index[student][assignment][detector];
			var pos = clusters.indexOf(cluster);

			if(pos >= 0) {
				clusters.splice(pos, 1);
			}
		}
	};

	// Assignment and detector optional.
	var query = function(student, _assignment, _detector) {
		if(!_assignment && !_detector) {
			return index[student] || null;
		}

		if(!_detector && index[student]) {
			return index[student][_assignment] || null;
		}

		if(index[student] && index[student][_assignment]) {
			return index[student][_assignment][_detector] || null;
		}

		return null;
	};

	// Returns a string array of all detector names where detection is positive.
	var queryDetectors = function(members, assignment) {
		var detectors = [];

		if(assignment === null) {
			return [];
		}

		for(var i = 0; i < members.length; i++) {
			var student = members[i].student;

			if(index[student] && index[student][assignment]) {
				var assignData = index[student][assignment];
				for(var key in assignData) {
					if(assignData.hasOwnProperty(key) && detectors.indexOf(key) === -1 && assignData[key].length > 0) {
						detectors.push(key);
					}
				}
			}

			var partner = members[i].partner;

			if(partner && index[partner] && index[partner][assignment]) {
				var assignData = index[partner][assignment];
				for(var key in assignData) {
					if(assignData.hasOwnProperty(key) && detectors.indexOf(key) === -1 && assignData[key].length > 0) {
						detectors.push(key);
					}
				}
			}
		}

		return detectors;
	}

	// Tells whether a cluster has cheating, based on the inverted index
	var hasCheating = function(cluster, assignment) {
		if(cluster.evaluation === 1) {
			return true;
		}

		if(cluster.evaluation === 2) {
			return false;
		}

		if(assignment === null) {
			return false;
		}

		return queryDetectors(cluster.members, assignment).length > 0;
	}

	var reset = function() {
		index = {};
	};

	// Return out the interface
	return {
		add: add,
		remove: remove,
		query: query,
		queryDetectors: queryDetectors,
		hasCheating: hasCheating,
		reset: reset
	};
})();

var ViewState = (function() {
	// Data members
	var corpusData = null;
	var spotData = null;
	var clusterDB = {};
	var cb = null;
	var studentIndex = StudentIndex;
	var state = {
		page: "loading",
		args: {}
	};

	// Functions
	var flush = function() {
		if(cb) {
			window.requestAnimationFrame(function() {
				cb({
					state: state,
					corpusData: corpusData,
					spotData: spotData,
					clusterDB: clusterDB,
					studentIndex: studentIndex
				});
			});
		}
	};

	var start = function(callback) {
		// Install the cb
		cb = callback;

		// Reset the index
		studentIndex.reset();

		// Download the corpus data
		$.get("/getcorpus", function(data) {
			corpusData = data;
			clusterDB = {};
			state.page = "evaluate";
			state.args = {};

			// Download the clusters
			corpusData.detectors.map(function(detector) {
				detector.assignments.map(function(assign) {
					// Grab the data
					var path = corpusData.corpus_path + detector.name + "/" + assign + "/clusters.json";
					var key = getClusterKey(false, assign, detector.name);

					$.get("/getclusters?path=" + path, function(clusters) {
						clusterDB[key] = clusters;

						// Rebuild the index
						clusters.map(function(cluster) {
							if(cluster.evaluation === 1) {
								updateIndex(cluster.members, assign, detector.name, cluster, 1);
							}
						});

						// Flush the data
						flush();
					}).fail(function(jq,err,ex) {
						// Something went wrong.
						console.log("start() error");
						console.log(err);
						console.log(ex);
						state.page = "error";
						state.args = {};
						flush();
					});
				});
			});
		}).fail(function() {
			console.log("Failed to retreive corpus info.");

			state.page = "import";
			state.args = {};

			flush();
		});
	};

	var importCorpus = function(path) {
		// Have the server perform the corpus import process
		$.get("/importcorpus?path=" + path, function(data) {
			// Get the new corpus data JSON (by calling start again)
			start(cb);
		});
	};

	var setSpotData = function(configPath, assignment, file) {
		// Get the config
		$.get("/file?path=" + configPath, function(config) {
			var path = config.corpusPath + "/__algae__/postprocessed/" + assignment + "/" + file;

			// Get the clusters
			$.get("/file?path=" + path, function(clusters) {
				// Update the cluster DB
				var clusterKey = getClusterKey(true, assignment, file);
				clusterDB[clusterKey] = clusters;

				// Set the spot data
				spotData = {
					corpusPath: config.corpusPath,
					assignment: assignment,
					file: file
				};

				// Flush
				flush();
			}).fail(function() {
				// Something went wrong.
				state.page = "error";
				state.args = {};
				flush();
			});
		}).fail(function() {
			// Something went wrong.
			state.page = "error";
			state.args = {};
			flush();
		});
	};

	var unsetSpotData = function() {
		spotData = null;
		flush();
	}

	var setState = function(page, args) {
		state = {
			page: page,
			args: args
		};

		flush();
	};

	var getClusterKey = function(fromSpot, assignment, detectorOrFilename) {
		var spotString = fromSpot ? "SPOT" : "CORPUS";

		return spotString + "_" + assignment + "_" + detectorOrFilename;
	};

	var updateIndex = function(members, assign, detector, cluster, evaluation) {
		// Update the inverted index
		if(evaluation === 1) {
			// Do an add for each student and partner
			for(var i = 0; i < members.length; i++) {
				var member = members[i];

				studentIndex.add(member.student, assign, detector, cluster);

				if(member.partner) {
					studentIndex.add(member.partner, assign, detector, cluster);
				}
			}
		} else {
			// Do a remove for each student and partner
			for(var i = 0; i < members.length; i++) {
				var member = members[i];

				studentIndex.remove(member.student, assign, detector, cluster);

				if(member.partner) {
					studentIndex.remove(member.partner, assign, detector, cluster);
				}
			}
		}
	}

	var setCluster = function(clusterKey, index, evaluation) {
		// Update the DB
		clusterDB[clusterKey][index].evaluation = evaluation;

		// If not a spot check, send to server
		if(state.page === "evaluate") {
			var split = clusterKey.split("_");
			var detector = split[2];
			var assign = split[1];
			var cluster = clusterDB[clusterKey][index];
			var members = cluster.members;

			// Update the index
			updateIndex(members, assign, detector, cluster, evaluation);

			// Save to the server
			var path = corpusData.corpus_path + detector + "/" + assign + "/clusters.json"
			$.get("/updatecluster?path=" + path + "&index=" + index + "&evaluation=" + evaluation, function(data) {
				// Do nothing.
			});
		}

		// Flush changes back
		flush();
	}

	var analyze = function(cb) {
		Analyzer(studentIndex, clusterDB, corpusData, cb);
	}

	// return out an interface
	return {
		start: start,
		importCorpus: importCorpus,
		setSpotData: setSpotData,
		unsetSpotData: unsetSpotData,
		setState: setState,
		getClusterKey: getClusterKey,
		setCluster: setCluster,
		analyze: analyze
	};

})();

// returns analysis of data as a string
var Analyzer = function(index, clusterDB, corpusData, cb) {
	var students = [];
	var cheaters = [];
	var data = {};
	var semesterTotals = {};
	var cheaterCounts = {};

	var path = corpusData.corpus_path + "../../students.txt";
	$.get("/file?path=" + path, function(studentText) {
		path = corpusData.corpus_path + "../../semesters.csv";
		$.get("/file?path=" + path, function(semesterText) {
			// Build inital structure
			students = studentText.trim().split("\n");

			var lines = semesterText.trim().split("\n");
			lines.map(function(line) {
				var sem = line.split(",")[1].trim();

				if(!semesterTotals[sem]) {
					semesterTotals[sem] = 0;
				}

				semesterTotals[sem] += 1;
			});

			// Collect the data
			collectData();

			// Collect more data, now that we have this initial data
			secondPass();

			// Save the results
			var results = "";

			results += "There are " + students.length + " total students in the corpus.\n";
			results += "Of which, " + cheaters.length + " or " + percent(cheaters.length, students.length) + "% were found to be cheating.\n\n";

			results += "Results per detector/assignment:\n\n";

			corpusData.detectors.map(function(detector) {
				detector.assignments.map(function(assign) {
					shortcut = data[detector.name][assign];

					results += "For " + detector.name + "/" + assign + ":\n";
					results += "Total clusters -> " + shortcut.totalCount + "\n";
					results += "Total unique students in clusters -> " + shortcut.uniqueMembers.length + "\n";
					results += "Total number of unique students found cheating -> " + shortcut.cheaters.length + "\n";
					results += "Directly implicated clusters -> " + shortcut.numDirect + "\n";
					results += "Auto-implicated clusters -> " + shortcut.numAuto + "\n";
					results += "False positive clusters -> " + shortcut.numFalsePos + "\n";
					var totalForAssign = data["ASSIGN"][assign].length;
					results += "Students out of total for this assignment: " + percent(shortcut.cheaters.length, totalForAssign) + "%\n\n";
				});
			});

			results += "Results per assignment:\n\n";
			for(var key in data["ASSIGN"]) {
				if(data["ASSIGN"].hasOwnProperty(key)) {
					var assign = data["ASSIGN"][key];
					results += "" + key + ": " + assign.length + " cheaters, or " + percent(assign.length, students.length) + "% of total students cheated.\n";
				}
			}
			results += "\n";

			results += "Results per semester:\n\n";
			results += "Number of intra-semester cheating clusters -> " + data["SEMESTER"].numIntra + "\n";
			results += "Number of inter-semester cheating clusters -> " + data["SEMESTER"].numInter + "\n";
			for(var key in data["SEMESTER"]) {
				if(data["SEMESTER"].hasOwnProperty(key) && key !== "numIntra" && key !== "numInter") {
					results += "" + key + ": " + data["SEMESTER"][key].length + " cheaters of " + semesterTotals[key] + ", or " + percent(data["SEMESTER"][key].length, semesterTotals[key]) + "%.\n";
				}
			}
			results += "\n";

			results += "Number of times students cheated:\n\n";
			for(var key in data["CHEATERCOUNT"]) {
				if(data["CHEATERCOUNT"].hasOwnProperty(key)) {
					results += "" + key + ": " + data["CHEATERCOUNT"][key] + " or " + percent(data["CHEATERCOUNT"][key], cheaters.length) + "%.\n";
				}
			}
			results += "\n";

			// all done
			cb(results);
		});
	});

	// Loop over every cluster, increasing appropriate counts
	function collectData() {
		corpusData.detectors.map(function(detector) {
			data[detector.name] = {};

			detector.assignments.map(function(assign) {
				data[detector.name][assign] = {};

				var key = ViewState.getClusterKey(false, assign, detector.name);
				var clusters = clusterDB[key];

				// Save the total cluster count
				data[detector.name][assign].totalCount = clusters.length;

				// Stub out data
				data[detector.name][assign].uniqueMembers = [];
				data[detector.name][assign].cheaters = [];
				data[detector.name][assign].numDirect = 0;
				data[detector.name][assign].numAuto = 0;
				data[detector.name][assign].numFalsePos = 0;

				clusters.map(function(cluster) {
					// Add the unique members to both this cluster and overall
					var members = cluster.members.reduce(function(prev, member) {
						prev.push(member.student);

						if(member.partner !== null) {
							prev.push(member.partner);
						}

						return prev;
					}, []);

					members.map(function(member) {
						var shortcut = data[detector.name][assign].uniqueMembers;
						if(shortcut.indexOf(member) === -1) {
							shortcut.push(member);
						}
					});

					// Is the cluster cheating?
					var cheating = index.hasCheating(cluster, assign);

					if(cheating) {
						// Make sure each member is in the total cheaters index
						members.map(function(member) {
							if(cheaters.indexOf(member) === -1) {
								cheaters.push(member);
							}

							// Count this as a cheater for this detector/assignment
							var shortcut = data[detector.name][assign].cheaters;
							if(shortcut.indexOf(member) === -1) {
								shortcut.push(member);
							}
						});

						// Direct or auto-implicated
						if(cluster.evaluation === 1) {
							data[detector.name][assign].numDirect += 1;
						} else {
							data[detector.name][assign].numAuto += 1;
						}
					} else {
						data[detector.name][assign].numFalsePos += 1;
					}
				});
			});
		});
	}

	// Now that we have first pass data, calculate more stats
	function secondPass() {
		data["ASSIGN"] = {};
		data["SEMESTER"] = {};
		data["SEMESTER"].numIntra = 0;
		data["SEMESTER"].numInter = 0;

		// Find total cheaters for an assignment
		corpusData.detectors.map(function(detector) {
			detector.assignments.map(function(assign) {
					if(!data["ASSIGN"][assign]) {
						data["ASSIGN"][assign] = [];
					}

					var shortcut = data[detector.name][assign];
					var dest = data["ASSIGN"][assign];

					shortcut.cheaters.map(function(student) {
						if(dest.indexOf(student) === -1) {
							dest.push(student);
						}

						if(!cheaterCounts[student]) {
							cheaterCounts[student] = [];
						}
						if(cheaterCounts[student].indexOf(assign) === -1) {
							cheaterCounts[student].push(assign);
						}
					});
			});
		});

		// Calculate cheater count distribution
		data["CHEATERCOUNT"] = {};
		for(var key in cheaterCounts) {
			if(cheaterCounts.hasOwnProperty(key)) {
				var value = cheaterCounts[key].length.toString();

				if(!data["CHEATERCOUNT"][value]) {
					data["CHEATERCOUNT"][value] = 0;
				}

				data["CHEATERCOUNT"][value] += 1;
			}
		}


		// Calculate the number of cheaters from each semester
		// Along with info a intra/inter-semester cheating
		corpusData.detectors.map(function(detector) {
			detector.assignments.map(function(assign) {
				var key = ViewState.getClusterKey(false, assign, detector.name);
				var clusters = clusterDB[key];

				clusters.map(function(cluster) {
					var initSemester = cluster.members[0].semester;
					var intra = true;

					cluster.members.map(function(member) {
						if(member.semester !== initSemester) {
							intra = false; // This cluster is inter-semester
						}

						if(!data["SEMESTER"][member.semester]) {
							data["SEMESTER"][member.semester] = [];
						}

						var shortcut = data["SEMESTER"][member.semester];

						// If they cheated, add to the semester
						if(shortcut.indexOf(member.student) === -1 && cheaters.indexOf(member.student) !== -1) {
							shortcut.push(member.student);
						}

						if(member.partner !== null && shortcut.indexOf(member.partner) === -1 && cheaters.indexOf(member.partner) !== -1) {
							shortcut.push(member.partner);
						}
					});

					if(index.hasCheating(cluster, assign)) {
						if(intra) {
							data["SEMESTER"].numIntra += 1;
						} else {
							data["SEMESTER"].numInter += 1;
						}
					}
				});
			});
		});
	}

	function percent(num, denom) {
		return ((num / denom) * 100.0).toFixed(2);
	}

}
