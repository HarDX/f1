const fs = require("fs");
const ics = require("ics");
const dayjs = require("dayjs");

// Grab the current i18n config
let i18nConfig = fs.readFileSync("i18n.json");
let i18n = JSON.parse(i18nConfig);

// Functions
function getPermutations(array, size) {
	function p(t, i) {
		if (t.length === size) {
			result.push(t);
			return;
		}
		if (i + 1 > array.length) {
			return;
		}
		p(t.concat(array[i]), i + 1);
		p(t, i + 1);
	}

	let result = [];
	p([], 0);
	return result;
}

function generateCalendars(siteKey){
	let rawConfig = fs.readFileSync(`_db/${siteKey}/config.json`);
	let config = JSON.parse(rawConfig);
	
	// Determine year to generate based off config...
	let year = config.availableYears.slice(-1);
	let rawdata = fs.readFileSync(`_db/${siteKey}/${year}.json`);
	let data = JSON.parse(rawdata);
	let prefix = siteKey.toUpperCase();
	
	// Calendar Options
	let calendarOptions = [];
	
	let sessionMap = config.sessionMap;
	for (session of Object.keys(sessionMap)) {
		calendarOptions.push(sessionMap[session]);
	}
	
	// Add the alarm suffix.
	calendarOptions.push("alarm");
	
	// Figure out all the permutations of the calendar...
	let optionPermutations = [];
	
	for (let length = 1; length < calendarOptions.length+1; length++) {
		optionPermutations.push(...getPermutations(calendarOptions, length));
	}
	
	let fileNames = [];
	let localizedFilenames = [];
	
	const legacyAlarmOptions = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120];
	const alarmOptions = [0, 30, 60, 90, 120];
	
	// Generate Filenames
	for (permutation of optionPermutations) {
		const filename = permutation.join("_");
	
		// If the filename contains alarm then add each of the alarm permutations.
		if (filename != "alarm") {
			// Add the filenames pre-alarm options
			fileNames.push(filename);
			localizedFilenames.push(filename);
			
			if (filename.includes("alarm")) {
				
				// If it's F1 Calendar generate all the legacy options....
				if(siteKey == "f1"){
					for (alarmOption of legacyAlarmOptions) {
						fileNames.push(filename + "-" + alarmOption);
					}
				}
				
				// If the site isn't F1 Calendar then generate the usual alarm options.
				for (alarmOption of alarmOptions) {
					if(siteKey != "f1"){
						fileNames.push(filename + "-" + alarmOption);
					}
					localizedFilenames.push(filename + "-" + alarmOption);
				}
			}
		}
	}
	
	if(process.env.NEXT_PUBLIC_SITE_KEY) {
		let downloadDir = `public/download`;
		if (!fs.existsSync(downloadDir)){
			fs.mkdirSync(downloadDir);
		}
	}
	
	// For each filename, create a ics file.
	for (language of i18n.locales) {
		// Create the folder in public...
		let dir = `./static/${language}`;
		
		if(process.env.NEXT_PUBLIC_SITE_KEY) {
			dir = `public/download/${language}`;
		}
		
		if (language != "en" && !fs.existsSync(dir)){
			fs.mkdirSync(dir);
		}
		
		let i18nStrings = fs.readFileSync(`locales/${language}/localization.json`);
		let localizedStrings = JSON.parse(i18nStrings);
	
		var languageFilesnames = language == "en" ? fileNames : localizedFilenames;
	
		for (request of languageFilesnames) {
			let sessionArray = request.split("_");
			let alarmEnabled = request.includes("alarm");
	
			let alarmOffset = 30;
			if (alarmEnabled) {
				let requestArray = request.split("-");
				alarmOffset = requestArray.slice(-1)[0];
				sessionArray = sessionArray.slice(0, -1);
			}
	
			let events = [];
	
			const races = data.races;
	
			let i = 0;
			for (i = 0; i < races.length; i++) {
				let race = races[i];
	
				// Check we have sessions as we'll keep them out of TBC races unless we have tentative dates.
				if (race.sessions != null) {
					// Sessions
					let s = 0;
					for (s = 0; s < Object.keys(race.sessions).length; s++) {
						let sessionKey = Object.keys(race.sessions)[s];
						let session = race.sessions[sessionKey];
	
						// Skip
						if(!sessionArray.includes(sessionMap[sessionKey])) continue;
						
						let title = race.name;
						let description = race.name;
						if (localizedStrings.races[race.localeKey]) {
							title = localizedStrings.races[race.localeKey];
							description = localizedStrings.races[race.localeKey];
						}
	
						let category = "Grand Prix";
						
						// If the session isn't featured then add the session name in front...
						// Or if there are multiple featured sessions then add the session name in front (sprint, feature etc)...
						if(!config.featuredSessions[sessionKey] || (config.featuredSessions[sessionKey] && config.featuredSessions.length > 1)){
							let sessionTitle = localizedStrings.schedule[sessionKey];
							title = `${prefix}: ${sessionTitle}`;
							category = sessionTitle;
						} else {
							title = `${prefix}: ${title}`;
						}
						
						// Session Length
						let sessionLength = 120;
	
						if(config.sessionLengths != null){
							if(config.sessionLengths[sessionKey] != null){
								sessionLength = config.sessionLengths[sessionKey];
							}
						}
						
						// TODO: Localize....
						let alarms = [];
						if (alarmEnabled) {
							let alarmDescription =
								title + " starts in " + alarmOffset + " minutes";
							alarms.push({
								action: "display",
								description: alarmDescription,
								trigger: {minutes: alarmOffset, before: true},
								repeat: 0
							});
						}
	
						let start = dayjs(session)
							.format("YYYY-M-D-H-m")
							.split("-")
							.map(function(t){return parseInt(t)});
							
						let end = dayjs(session)
							.add(sessionLength, "minutes")
							.format("YYYY-M-D-H-m")
							.split("-")
							.map(function(t){return parseInt(t)});
							
						let status = "CONFIRMED";
						if (race.tbc) {
							status = "TENTATIVE";
	
							let tbcString = localizedStrings.badges.tbc
								? localizedStrings.badges.tbc
								: "TBC";
							title = `(${tbcString}) ${title}`;
						}
	
						if (race.canceled) {
							status = "CANCELLED";
	
							let cancelledString = localizedStrings.badges.canceled
								? localizedStrings.badges.canceled
								: "CANCELED";
							title = `(${cancelledString}) ${title}`;
						}
	
						let event = {
							title: title,
							description: description,
							location: race.location,
							productId: config.url,
							uid: "http://" + year + "." + config.url + "/#GP" + i + "_" + year + "_" + sessionKey,
							categories: [category, prefix],
							start: start,
							end: end,
							geo: {lat: race.latitude, lon: race.longitude},
							sequence: parseInt(year),
							alarms: alarms,
							status: status
						};
						events.push(event);
					}
				}
			}
			
			if(events.length != 0){
				ics.createEvents(events, (error, value) => {
					if (error) {
						// TODO: Handle an error...
						console.log("Calendar Error: " + JSON.stringify(error));
					} else {
						let folder = (language === "en") ? `./static/` : `./static/${language}/`;
						
						if(process.env.NEXT_PUBLIC_SITE_KEY) {
							folder = (language === "en") ? `public/download/` : `public/download/${language}/`;
						}
						
						let path = `${folder}${siteKey}-calendar_${request}.ics`;
						
						console.log("Writing Calendar to " + path);
		
						fs.writeFileSync(path, value);
					}
				});
			} else {
				console.log("Skipped creation");
			} 
		}
	}
}

function generateAllCalendars() {
	console.log('Generating Calendars for all sites');
	
	// Generate and deploy all calendars.
	let rawConfig = fs.readFileSync(`_db/sites.json`);
	let config = JSON.parse(rawConfig);
	let sites = config.sites;
	
	for (site of sites) {
		console.log("Generating Calendars for " + site.siteKey);
		
		generateCalendars(site.siteKey);
	}
}

console.log('process.argv ' + process.argv);

if(process.argv.length > 2){
	var args = process.argv.slice(2);
	
	// Generate and deploy specific calendar
	let site = args[0];
	
	if(site === "all"){
		generateAllCalendars();
	} else if(site === "build"){
		console.log("Generating Calendars for " + process.env.NEXT_PUBLIC_SITE_KEY);
		generateCalendars(process.env.NEXT_PUBLIC_SITE_KEY);
	} else {
		console.log("Generating Calendars for " + site);
		generateCalendars(site);
	}
} else {
	generateAllCalendars();
}


