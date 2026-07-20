/* GRIDIRON DYNASTY — teams-fbs.js
 * All 136 NCAA FBS programs, 2025 conference alignment.
 * Compact tuple format expanded into team records at load.
 * Tuple: [id, name, nick, conf, city, st, primary, secondary, prestige, stadium, cap, emoji, rivals]
 * prestige 1-10 (blue bloods 9-10). rivals = array of team ids (may be sparse).
 * Colors/locations authored from public knowledge; see images/logos/README.md
 * for correction/sourcing notes.
 */
(function () {
  'use strict';

  var F = [
    // ---- SEC (16) ----
    ['alabama','Alabama','Crimson Tide','SEC','Tuscaloosa','AL','#9e1b32','#828a8f',10,'Bryant-Denny Stadium',100077,'🐘',['auburn','tennessee','lsu']],
    ['arkansas','Arkansas','Razorbacks','SEC','Fayetteville','AR','#9d2235','#000000',5,'Razorback Stadium',76212,'🐗',['texasam','missouri','lsu']],
    ['auburn','Auburn','Tigers','SEC','Auburn','AL','#0c2340','#dd550c',8,'Jordan-Hare Stadium',88043,'🐅',['alabama','georgia']],
    ['florida','Florida','Gators','SEC','Gainesville','FL','#0021a5','#fa4616',8,'Ben Hill Griffin Stadium',88548,'🐊',['georgia','floridastate','tennessee']],
    ['georgia','Georgia','Bulldogs','SEC','Athens','GA','#ba0c2f','#000000',10,'Sanford Stadium',92746,'🐶',['florida','auburn','georgiatech']],
    ['kentucky','Kentucky','Wildcats','SEC','Lexington','KY','#0033a0','#ffffff',5,'Kroger Field',61000,'🐱',['louisville','tennessee']],
    ['lsu','LSU','Tigers','SEC','Baton Rouge','LA','#461d7c','#fdd023',9,'Tiger Stadium',102321,'🐯',['alabama','texasam','olemiss']],
    ['mississippist','Mississippi State','Bulldogs','SEC','Starkville','MS','#5d1725','#ffffff',5,'Davis Wade Stadium',61337,'🐕',['olemiss','lsu']],
    ['missouri','Missouri','Tigers','SEC','Columbia','MO','#f1b82d','#000000',6,'Faurot Field',61620,'🐯',['arkansas','kansas']],
    ['oklahoma','Oklahoma','Sooners','SEC','Norman','OK','#841617','#fdf9d8',9,'Gaylord Family Stadium',80126,'🌾',['texas','oklahomast']],
    ['olemiss','Ole Miss','Rebels','SEC','Oxford','MS','#ce1126','#14213d',6,'Vaught-Hemingway Stadium',64038,'🐻',['mississippist','lsu']],
    ['southcarolina','South Carolina','Gamecocks','SEC','Columbia','SC','#73000a','#000000',6,'Williams-Brice Stadium',77559,'🐓',['clemson','georgia']],
    ['tennessee','Tennessee','Volunteers','SEC','Knoxville','TN','#ff8200','#ffffff',8,'Neyland Stadium',101915,'🍊',['alabama','florida','kentucky']],
    ['texas','Texas','Longhorns','SEC','Austin','TX','#bf5700','#ffffff',9,'DKR-Texas Memorial Stadium',100119,'🤘',['oklahoma','texasam','texastech']],
    ['texasam','Texas A&M','Aggies','SEC','College Station','TX','#500000','#ffffff',7,'Kyle Field',102733,'🐎',['texas','lsu','arkansas']],
    ['vanderbilt','Vanderbilt','Commodores','SEC','Nashville','TN','#000000','#c9a86a',3,'FirstBank Stadium',34000,'⚓',['tennessee']],

    // ---- Big Ten (18) ----
    ['illinois','Illinois','Fighting Illini','Big Ten','Champaign','IL','#13294b','#e84a27',5,'Memorial Stadium',60670,'🧡',['northwestern','indiana']],
    ['indiana','Indiana','Hoosiers','Big Ten','Bloomington','IN','#990000','#ffffff',5,'Memorial Stadium',52626,'🔴',['purdue','illinois']],
    ['iowa','Iowa','Hawkeyes','Big Ten','Iowa City','IA','#ffcd00','#000000',7,'Kinnick Stadium',69250,'🦅',['iowast','minnesota','wisconsin','nebraska']],
    ['maryland','Maryland','Terrapins','Big Ten','College Park','MD','#e03a3e','#ffd520',4,'SECU Stadium',51802,'🐢',['rutgers','penn']],
    ['michigan','Michigan','Wolverines','Big Ten','Ann Arbor','MI','#00274c','#ffcb05',9,'Michigan Stadium',107601,'〽️',['ohiostate','michiganst','notredame']],
    ['michiganst','Michigan State','Spartans','Big Ten','East Lansing','MI','#18453b','#ffffff',6,'Spartan Stadium',75005,'🟢',['michigan','penn']],
    ['minnesota','Minnesota','Golden Gophers','Big Ten','Minneapolis','MN','#7a0019','#ffcc33',5,'Huntington Bank Stadium',50805,'🐿️',['wisconsin','iowa','nebraska']],
    ['nebraska','Nebraska','Cornhuskers','Big Ten','Lincoln','NE','#e41c38','#ffffff',6,'Memorial Stadium',85458,'🌽',['iowa','wisconsin','minnesota']],
    ['northwestern','Northwestern','Wildcats','Big Ten','Evanston','IL','#4e2a84','#ffffff',4,'Ryan Field',12000,'🐾',['illinois']],
    ['ohiostate','Ohio State','Buckeyes','Big Ten','Columbus','OH','#bb0000','#666666',10,'Ohio Stadium',102780,'🌰',['michigan','penn']],
    ['oregon','Oregon','Ducks','Big Ten','Eugene','OR','#154733','#fee123',8,'Autzen Stadium',54000,'🦆',['oregonst','washington']],
    ['penn','Penn State','Nittany Lions','Big Ten','University Park','PA','#041e42','#ffffff',8,'Beaver Stadium',106572,'🦁',['ohiostate','michigan','michiganst']],
    ['purdue','Purdue','Boilermakers','Big Ten','West Lafayette','IN','#ceb888','#000000',4,'Ross-Ade Stadium',57236,'🚂',['indiana','notredame']],
    ['rutgers','Rutgers','Scarlet Knights','Big Ten','Piscataway','NJ','#cc0033','#000000',4,'SHI Stadium',52454,'⚔️',['maryland','penn']],
    ['ucla','UCLA','Bruins','Big Ten','Los Angeles','CA','#2d68c4','#f2a900',6,'Rose Bowl',88565,'🐻',['usc','oregon']],
    ['usc','USC','Trojans','Big Ten','Los Angeles','CA','#990000','#ffcc00',8,'LA Memorial Coliseum',77500,'✌️',['ucla','notredame','oregon']],
    ['washington','Washington','Huskies','Big Ten','Seattle','WA','#4b2e83','#b7a57a',7,'Husky Stadium',70083,'🐺',['washingtonst','oregon']],
    ['wisconsin','Wisconsin','Badgers','Big Ten','Madison','WI','#c5050c','#ffffff',7,'Camp Randall Stadium',75822,'🦡',['minnesota','iowa','nebraska']],

    // ---- Big 12 (16) ----
    ['arizona','Arizona','Wildcats','Big 12','Tucson','AZ','#003366','#cc0033',5,'Arizona Stadium',50782,'🌵',['arizonast']],
    ['arizonast','Arizona State','Sun Devils','Big 12','Tempe','AZ','#8c1d40','#ffc627',6,'Mountain America Stadium',53599,'😈',['arizona']],
    ['baylor','Baylor','Bears','Big 12','Waco','TX','#003015','#ffb81c',6,'McLane Stadium',45140,'🐻',['tcu','texastech']],
    ['byu','BYU','Cougars','Big 12','Provo','UT','#002e5d','#ffffff',6,'LaVell Edwards Stadium',63470,'💙',['utah','utahst']],
    ['cincinnati','Cincinnati','Bearcats','Big 12','Cincinnati','OH','#e00122','#000000',6,'Nippert Stadium',40000,'🐾',['westvirginia']],
    ['colorado','Colorado','Buffaloes','Big 12','Boulder','CO','#cfb87c','#000000',6,'Folsom Field',50183,'🦬',['coloradost','utah','nebraska']],
    ['houston','Houston','Cougars','Big 12','Houston','TX','#c8102e','#ffffff',5,'TDECU Stadium',40000,'🐾',['rice','texastech']],
    ['iowast','Iowa State','Cyclones','Big 12','Ames','IA','#c8102e','#f1be48',6,'Jack Trice Stadium',61500,'🌀',['iowa','kansasst']],
    ['kansas','Kansas','Jayhawks','Big 12','Lawrence','KS','#0051ba','#e8000d',4,'David Booth Kansas Memorial',47000,'🐦',['kansasst','missouri']],
    ['kansasst','Kansas State','Wildcats','Big 12','Manhattan','KS','#512888','#ffffff',6,'Bill Snyder Family Stadium',50000,'🐾',['kansas','iowast']],
    ['oklahomast','Oklahoma State','Cowboys','Big 12','Stillwater','OK','#ff7300','#000000',7,'Boone Pickens Stadium',55509,'🤠',['oklahoma']],
    ['tcu','TCU','Horned Frogs','Big 12','Fort Worth','TX','#4d1979','#a3a9ac',7,'Amon G. Carter Stadium',47000,'🐸',['baylor','smu','texastech']],
    ['texastech','Texas Tech','Red Raiders','Big 12','Lubbock','TX','#cc0000','#000000',6,'Jones AT&T Stadium',60454,'⚔️',['texas','baylor','tcu']],
    ['ucf','UCF','Knights','Big 12','Orlando','FL','#000000','#ba9b37',5,'FBC Mortgage Stadium',44206,'🛡️',['southflorida']],
    ['utah','Utah','Utes','Big 12','Salt Lake City','UT','#cc0000','#ffffff',7,'Rice-Eccles Stadium',51444,'⛰️',['byu','utahst','colorado']],
    ['westvirginia','West Virginia','Mountaineers','Big 12','Morgantown','WV','#002855','#eaaa00',6,'Milan Puskar Stadium',60000,'⛏️',['cincinnati','pittsburgh']],

    // ---- ACC (17) ----
    ['bostoncollege','Boston College','Eagles','ACC','Chestnut Hill','MA','#8a100b','#b29d6c',4,'Alumni Stadium',44500,'🦅',['syracuse']],
    ['california','California','Golden Bears','ACC','Berkeley','CA','#003262','#fdb515',5,'California Memorial Stadium',63000,'🐻',['stanford']],
    ['clemson','Clemson','Tigers','ACC','Clemson','SC','#f56600','#522d80',9,'Memorial Stadium',81500,'🐾',['southcarolina','floridastate','georgiatech']],
    ['duke','Duke','Blue Devils','ACC','Durham','NC','#003087','#ffffff',4,'Wallace Wade Stadium',40004,'😈',['unc','ncstate','wakeforest']],
    ['floridastate','Florida State','Seminoles','ACC','Tallahassee','FL','#782f40','#ceb888',8,'Doak Campbell Stadium',79560,'🏹',['miami','florida','clemson']],
    ['georgiatech','Georgia Tech','Yellow Jackets','ACC','Atlanta','GA','#b3a369','#003057',5,'Bobby Dodd Stadium',55000,'🐝',['georgia','clemson']],
    ['louisville','Louisville','Cardinals','ACC','Louisville','KY','#ad0000','#000000',6,'L&N Stadium',60800,'🐦',['kentucky']],
    ['miami','Miami','Hurricanes','ACC','Miami Gardens','FL','#f47321','#005030',7,'Hard Rock Stadium',65326,'🌀',['floridastate','florida']],
    ['ncstate','NC State','Wolfpack','ACC','Raleigh','NC','#cc0000','#000000',5,'Carter-Finley Stadium',57583,'🐺',['unc','wakeforest','duke']],
    ['unc','North Carolina','Tar Heels','ACC','Chapel Hill','NC','#7bafd4','#ffffff',6,'Kenan Stadium',50500,'🐏',['ncstate','duke','virginia']],
    ['pittsburgh','Pittsburgh','Panthers','ACC','Pittsburgh','PA','#003594','#ffb81c',5,'Acrisure Stadium',68400,'🐾',['westvirginia','syracuse']],
    ['smu','SMU','Mustangs','ACC','Dallas','TX','#0033a0','#cc0035',6,'Gerald J. Ford Stadium',32000,'🐎',['tcu','houston']],
    ['stanford','Stanford','Cardinal','ACC','Stanford','CA','#8c1515','#ffffff',6,'Stanford Stadium',50424,'🌲',['california','usc']],
    ['syracuse','Syracuse','Orange','ACC','Syracuse','NY','#f76900','#0b132b',5,'JMA Wireless Dome',49262,'🍊',['bostoncollege','pittsburgh']],
    ['virginia','Virginia','Cavaliers','ACC','Charlottesville','VA','#232d4b','#f84c1e',4,'Scott Stadium',61500,'⚔️',['virginiatech','unc']],
    ['virginiatech','Virginia Tech','Hokies','ACC','Blacksburg','VA','#630031','#cf4420',6,'Lane Stadium',65632,'🦃',['virginia','westvirginia']],
    ['wakeforest','Wake Forest','Demon Deacons','ACC','Winston-Salem','NC','#9e7e38','#000000',4,'Allegacy Stadium',31500,'😈',['ncstate','duke','unc']],

    // ---- Pac-12 (2, 2025) ----
    ['oregonst','Oregon State','Beavers','Pac-12','Corvallis','OR','#dc4405','#000000',5,'Reser Stadium',35548,'🦫',['oregon','washingtonst']],
    ['washingtonst','Washington State','Cougars','Pac-12','Pullman','WA','#981e32','#5e6a71',5,'Gesa Field',32952,'🐾',['washington','oregonst']],

    // ---- American (14) ----
    ['army','Army','Black Knights','American','West Point','NY','#000000','#d4bf91',5,'Michie Stadium',38000,'⚔️',['navy','airforce']],
    ['charlotte','Charlotte','49ers','American','Charlotte','NC','#046a38','#b9975b',3,'Jerry Richardson Stadium',15314,'⛏️',[]],
    ['eastcarolina','East Carolina','Pirates','American','Greenville','NC','#592a8a','#fdc82f',4,'Dowdy-Ficklen Stadium',50000,'🏴‍☠️',['southflorida']],
    ['fau','Florida Atlantic','Owls','American','Boca Raton','FL','#003366','#cc0000',3,'FAU Stadium',29419,'🦉',[]],
    ['memphis','Memphis','Tigers','American','Memphis','TN','#003087','#898d8d',5,'Simmons Bank Liberty',58325,'🐯',['tulane']],
    ['navy','Navy','Midshipmen','American','Annapolis','MD','#00205b','#c5b783',5,'Navy-Marine Corps',34000,'⚓',['army','airforce']],
    ['northtexas','North Texas','Mean Green','American','Denton','TX','#00853e','#ffffff',3,'DATCU Stadium',30850,'🦅',[]],
    ['rice','Rice','Owls','American','Houston','TX','#00205b','#c1c6c8',3,'Rice Stadium',47000,'🦉',['houston']],
    ['southflorida','South Florida','Bulls','American','Tampa','FL','#006747','#cfc493',4,'Raymond James Stadium',65890,'🐂',['ucf','eastcarolina']],
    ['temple','Temple','Owls','American','Philadelphia','PA','#9d2235','#ffffff',3,'Lincoln Financial Field',69176,'🦉',[]],
    ['tulane','Tulane','Green Wave','American','New Orleans','LA','#005837','#7fcfdd',5,'Yulman Stadium',30000,'🌊',['memphis']],
    ['tulsa','Tulsa','Golden Hurricane','American','Tulsa','OK','#003366','#c5b358',3,'H.A. Chapman Stadium',30000,'🌀',[]],
    ['uab','UAB','Blazers','American','Birmingham','AL','#1e6b52','#f4c300',3,'Protective Stadium',47100,'🐉',[]],
    ['utsa','UTSA','Roadrunners','American','San Antonio','TX','#0c2340','#f15a22',4,'Alamodome',64000,'🐦',[]],

    // ---- Conference USA (12) ----
    ['delaware','Delaware','Blue Hens','CUSA','Newark','DE','#00539f','#ffd200',3,'Delaware Stadium',18500,'🐔',[]],
    ['fiu','FIU','Panthers','CUSA','Miami','FL','#081e3f','#b6862c',2,'Riccardo Silva Stadium',20000,'🐾',[]],
    ['jacksonvillest','Jacksonville State','Gamecocks','CUSA','Jacksonville','AL','#cc0000','#ffffff',3,'Burgess-Snow Field',24000,'🐓',[]],
    ['kennesawst','Kennesaw State','Owls','CUSA','Kennesaw','GA','#231f20','#fdb913',2,'Fifth Third Stadium',10200,'🦉',[]],
    ['liberty','Liberty','Flames','CUSA','Lynchburg','VA','#002d62','#a6192e',4,'Williams Stadium',25000,'🔥',[]],
    ['louisianatech','Louisiana Tech','Bulldogs','CUSA','Ruston','LA','#002f8b','#e31b23',3,'Joe Aillet Stadium',28019,'🐶',[]],
    ['middletennessee','Middle Tennessee','Blue Raiders','CUSA','Murfreesboro','TN','#0066cc','#ffffff',3,'Floyd Stadium',30788,'⚔️',[]],
    ['missourist','Missouri State','Bears','CUSA','Springfield','MO','#5e0009','#ffffff',2,'Plaster Stadium',17500,'🐻',[]],
    ['newmexicost','New Mexico State','Aggies','CUSA','Las Cruces','NM','#8c0b42','#ffffff',2,'Aggie Memorial Stadium',28853,'🐎',[]],
    ['samhouston','Sam Houston','Bearkats','CUSA','Huntsville','TX','#f36b21','#003058',3,'Bowers Stadium',14000,'🐻',[]],
    ['utep','UTEP','Miners','CUSA','El Paso','TX','#ff8200','#041e42',3,'Sun Bowl',46670,'⛏️',['newmexicost']],
    ['westernkentucky','Western Kentucky','Hilltoppers','CUSA','Bowling Green','KY','#c60c30','#ffffff',4,'Houchens-Smith Stadium',22113,'🔴',[]],

    // ---- MAC (13) ----
    ['akron','Akron','Zips','MAC','Akron','OH','#00285e','#84754e',2,'InfoCision Stadium',30000,'🦘',[]],
    ['ballst','Ball State','Cardinals','MAC','Muncie','IN','#ba0c2f','#ffffff',2,'Scheumann Stadium',22500,'🐦',[]],
    ['bowlinggreen','Bowling Green','Falcons','MAC','Bowling Green','OH','#fe5000','#4f2c1d',3,'Doyt Perry Stadium',24000,'🦅',['toledo']],
    ['buffalo','Buffalo','Bulls','MAC','Buffalo','NY','#005bbb','#ffffff',3,'UB Stadium',29013,'🐂',[]],
    ['centralmichigan','Central Michigan','Chippewas','MAC','Mount Pleasant','MI','#6a0032','#ffc82e',3,'Kelly/Shorts Stadium',30255,'🌽',['westernmichigan']],
    ['easternmichigan','Eastern Michigan','Eagles','MAC','Ypsilanti','MI','#046a38','#ffffff',2,'Rynearson Stadium',30200,'🦅',[]],
    ['kentst','Kent State','Golden Flashes','MAC','Kent','OH','#002664','#f0b310',2,'Dix Stadium',25319,'⚡',[]],
    ['miamioh','Miami (OH)','RedHawks','MAC','Oxford','OH','#c8102e','#ffffff',4,'Yager Stadium',24286,'🦅',['ohio']],
    ['northernillinois','Northern Illinois','Huskies','MAC','DeKalb','IL','#ba0c2f','#000000',3,'Huskie Stadium',24000,'🐺',[]],
    ['ohio','Ohio','Bobcats','MAC','Athens','OH','#00694e','#ffffff',3,'Peden Stadium',24000,'🐾',['miamioh']],
    ['toledo','Toledo','Rockets','MAC','Toledo','OH','#003e7e','#ffb700',4,'Glass Bowl',26248,'🚀',['bowlinggreen']],
    ['umass','UMass','Minutemen','MAC','Amherst','MA','#881c1c','#ffffff',2,'McGuirk Stadium',17000,'⚔️',[]],
    ['westernmichigan','Western Michigan','Broncos','MAC','Kalamazoo','MI','#6c4023','#b5a167',3,'Waldo Stadium',30200,'🐎',['centralmichigan']],

    // ---- Mountain West (12) ----
    ['airforce','Air Force','Falcons','Mountain West','Colorado Springs','CO','#004a7b','#8a8d8f',5,'Falcon Stadium',46692,'🦅',['army','navy']],
    ['boisest','Boise State','Broncos','Mountain West','Boise','ID','#0033a0','#d64309',7,'Albertsons Stadium',36387,'🐎',['fresnost']],
    ['coloradost','Colorado State','Rams','Mountain West','Fort Collins','CO','#1e4d2b','#c8c372',4,'Canvas Stadium',41000,'🐏',['colorado','wyoming']],
    ['fresnost','Fresno State','Bulldogs','Mountain West','Fresno','CA','#db0032','#002554',5,'Valley Children\'s Stadium',40727,'🐶',['sanjosest','boisest']],
    ['hawaii','Hawaii','Rainbow Warriors','Mountain West','Honolulu','HI','#024731','#c8c8c8',3,'Ching Complex',9000,'🌈',[]],
    ['nevada','Nevada','Wolf Pack','Mountain West','Reno','NV','#003366','#a5acaf',3,'Mackay Stadium',27000,'🐺',['unlv']],
    ['newmexico','New Mexico','Lobos','Mountain West','Albuquerque','NM','#ba0c2f','#000000',3,'University Stadium',39224,'🐺',[]],
    ['sandiegost','San Diego State','Aztecs','Mountain West','San Diego','CA','#a6192e','#000000',5,'Snapdragon Stadium',35000,'⚔️',[]],
    ['sanjosest','San Jose State','Spartans','Mountain West','San Jose','CA','#0055a2','#e5a823',3,'CEFCU Stadium',21100,'🛡️',['fresnost']],
    ['unlv','UNLV','Rebels','Mountain West','Las Vegas','NV','#b10202','#666666',4,'Allegiant Stadium',65000,'⚔️',['nevada']],
    ['utahst','Utah State','Aggies','Mountain West','Logan','UT','#00263a','#8a8d8f',4,'Maverik Stadium',25100,'🐎',['byu','utah']],
    ['wyoming','Wyoming','Cowboys','Mountain West','Laramie','WY','#492f24','#ffc425',4,'War Memorial Stadium',29181,'🤠',['coloradost']],

    // ---- Sun Belt (14) ----
    ['appalachianst','Appalachian State','Mountaineers','Sun Belt','Boone','NC','#000000','#ffcc00',5,'Kidd Brewer Stadium',30000,'⛰️',['georgiasouthern']],
    ['arkansasst','Arkansas State','Red Wolves','Sun Belt','Jonesboro','AR','#cc092f','#000000',3,'Centennial Bank Stadium',30406,'🐺',[]],
    ['coastalcarolina','Coastal Carolina','Chanticleers','Sun Belt','Conway','SC','#006f71','#a27752',4,'Brooks Stadium',20000,'🐓',[]],
    ['georgiasouthern','Georgia Southern','Eagles','Sun Belt','Statesboro','GA','#011e41','#87714d',4,'Paulson Stadium',25000,'🦅',['appalachianst','georgiast']],
    ['georgiast','Georgia State','Panthers','Sun Belt','Atlanta','GA','#0039a6','#c60c30',3,'Center Parc Stadium',24333,'🐾',['georgiasouthern']],
    ['jamesmadison','James Madison','Dukes','Sun Belt','Harrisonburg','VA','#450084','#cbb677',5,'Bridgeforth Stadium',25000,'🐾',['oldominion']],
    ['louisiana','Louisiana','Ragin\' Cajuns','Sun Belt','Lafayette','LA','#ce181e','#000000',4,'Cajun Field',41426,'🌶️',['ulmonroe']],
    ['ulmonroe','UL Monroe','Warhawks','Sun Belt','Monroe','LA','#800029','#fdb913',2,'Malone Stadium',30427,'🦅',['louisiana']],
    ['marshall','Marshall','Thundering Herd','Sun Belt','Huntington','WV','#00b140','#000000',4,'Joan C. Edwards Stadium',38227,'🐃',[]],
    ['oldominion','Old Dominion','Monarchs','Sun Belt','Norfolk','VA','#003057','#a1d2f1',3,'S.B. Ballard Stadium',21944,'👑',['jamesmadison']],
    ['southalabama','South Alabama','Jaguars','Sun Belt','Mobile','AL','#00205b','#bf0d3e',3,'Hancock Whitney Stadium',25450,'🐆',['troy']],
    ['southernmiss','Southern Miss','Golden Eagles','Sun Belt','Hattiesburg','MS','#000000','#ffc72c',4,'M.M. Roberts Stadium',36000,'🦅',[]],
    ['texasst','Texas State','Bobcats','Sun Belt','San Marcos','TX','#501214','#8d734a',3,'UFCU Stadium',30000,'🐾',[]],
    ['troy','Troy','Trojans','Sun Belt','Troy','AL','#8a2432','#c1c6c8',4,'Veterans Memorial Stadium',30000,'⚔️',['southalabama']],

    // ---- Independents (2) ----
    ['notredame','Notre Dame','Fighting Irish','Independent','Notre Dame','IN','#0c2340','#c99700',9,'Notre Dame Stadium',77622,'☘️',['usc','michigan','stanford','navy']],
    ['uconn','UConn','Huskies','Independent','Storrs','CT','#000e2f','#e4002b',3,'Rentschler Field',40000,'🐺',[]]
  ];

  var teams = F.map(function (r) {
    return {
      id: r[0], name: r[1], nick: r[2], conf: r[3], city: r[4], st: r[5],
      colors: [r[6], r[7]], prestige: r[8], stadium: r[9], cap: r[10],
      emoji: r[11], rivals: r[12] || [], div: 'fbs'
    };
  });

  window.TeamData.register('fbs', teams);
})();
