/* GRIDIRON DYNASTY — names.js
 * window.NameData: pools for generating fictional player + recruit names.
 * Names are generic/fictional and not meant to represent real people.
 */
(function () {
  'use strict';

  var first = [
    'Jaylen','Marcus','Trey','DeShawn','Cade','Tyler','Xavier','Malik','Jordan','Isaiah',
    'Bryce','Kaden','Damon','Elijah','Amari','Cole','Devin','Jamal','Micah','Nolan',
    'Rashad','Silas','Terrance','Vince','Wyatt','Zion','Antoine','Brock','Carter','Darius',
    'Emmitt','Freddie','Gavin','Hunter','Ivan','Jaxon','Keon','Lorenzo','Mason','Nate',
    'Omar','Preston','Quincy','Reggie','Shane','Tobias','Uriah','Vernon','Weston','Deon',
    'Beau','Chase','Dominic','Ezra','Finn','Grant','Hayes','Jace','Kellen','Landon',
    'Miles','Owen','Parker','Roman','Sawyer','Tanner','Zeke','Andre','Bo','Cam',
    'Dalton','Eli','Gage','Jabari','Khalil','Legend','Maverick','Nico','Ronan','Tremaine'
  ];
  var last = [
    'Washington','Jackson','Robinson','Coleman','Barnes','Freeman','Sanders','Bryant','Foster','Hayes',
    'Reed','Bell','Ward','Cross','Dixon','Ellis','Fields','Grimes','Hart','Ivory',
    'Jennings','Knox','Lang','Mays','Nash','Owens','Pierce','Quinn','Rhodes','Stokes',
    'Tate','Vaughn','Walls','York','Abrams','Beckham','Carr','Dupree','Everett','Flowers',
    'Gaines','Holt','Ingram','Joseph','Keys','Love','Monroe','Newton','Osborn','Prince',
    'Rankin','Sharpe','Thornton','Underwood','Vance','Whitfield','Xander','Yates','Zamora','Booker',
    'Chandler','Dawson','Emory','Franklin','Guthrie','Hendrix','Isaac','Jamison','Kingston','Landry',
    'Mercer','Nixon','Ocampo','Paxton','Ramsey','Solomon','Trice','Valentine','Wren','Zeller'
  ];
  var hometowns = [
    ['Atlanta','GA'],['Savannah','GA'],['Miami','FL'],['Tampa','FL'],['Orlando','FL'],
    ['Dallas','TX'],['Houston','TX'],['Austin','TX'],['San Antonio','TX'],['Longview','TX'],
    ['Los Angeles','CA'],['Fresno','CA'],['Sacramento','CA'],['Charlotte','NC'],['Raleigh','NC'],
    ['Birmingham','AL'],['Mobile','AL'],['New Orleans','LA'],['Baton Rouge','LA'],['Memphis','TN'],
    ['Nashville','TN'],['Cleveland','OH'],['Cincinnati','OH'],['Detroit','MI'],['Chicago','IL'],
    ['Philadelphia','PA'],['Pittsburgh','PA'],['Baltimore','MD'],['Richmond','VA'],['Phoenix','AZ']
  ];
  var schoolPrefixes = ['Central','North','South','East','West','Memorial','Union','Heritage','Lincoln','Roosevelt'];
  var schoolSuffixes = ['High','Academy','Prep','Tech','Catholic','Charter'];

  window.NameData = {
    first: first, last: last,
    make: function (rng) {
      var f = first[Math.floor(rng() * first.length)];
      var l = last[Math.floor(rng() * last.length)];
      return f + ' ' + l;
    },
    makeIdentity: function (rng) {
      var home = hometowns[Math.floor(rng() * hometowns.length)];
      var school = schoolPrefixes[Math.floor(rng() * schoolPrefixes.length)] + ' ' +
        schoolSuffixes[Math.floor(rng() * schoolSuffixes.length)];
      return { name: this.make(rng), hometown: home[0], state: home[1], highSchool: school };
    }
  };
})();
