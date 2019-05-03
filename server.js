require('dotenv').config();
const path = require('path');
const fs = require('fs');
const glob = require('glob');
const os = require('os');
const moment = require('moment');

const suncalc = require('suncalc');

// const times = suncalc.getTimes( new Date(), process.env.latitude, process.env.longitude );

// Object.keys( times ).forEach( timeKey => {
//   console.log([ timeKey, moment( times[ timeKey ] ).utc().format('YYYY/MMDDHH/mmss'), moment( times[ timeKey ] ).utcOffset( moment().utcOffset() ).format('YYYY/MMDDHH/mmss') ]);
// })

// console.log( times );

function getTimes() {
  return new Promise( async resolve => {
    try {
      resolve([ false, suncalc.getTimes( new Date(), process.env.latitude, process.env.longitude ) ]);
    } catch( error ) {
      resolve([ error, {} ]);
    }
  });
}

function getTime( timeKey, format ) {
  return new Promise( async resolve => {
    const [ error, times ] = await getTimes();
    if( error ) {
      resolve([ error, '' ])
    } else if ( typeof times[ timeKey ] === 'undefined' ) {
      resolve([ timeKey + ' does not exist', '' ])
    } else {
      resolve([ false, moment( times[ timeKey ] ).utc().format( format ) ])
    }
  });
}

function getFiles( pattern, options ) {
  return new Promise( async resolve => {
    try {

      glob( pattern, options, async ( err, files ) => {
        resolve([ err, files ])
      })

    } catch( error ) {
      resolve([ error, [] ]);
    }
  });
}

function fixMonth( month ) {
  return ( Number( month ) - 1 ).toString().padStart( 2, '0' )
}

function filterFiles( min = true, monthDayHour, minSec, files ) {
  minSec = ( Math.floor( minSec / 100 ) * 100 ) + ( min ? 0 : 100 );
  return files.filter( x => {
    const [ hourFolder, fileName ] = x.replace('.jpg', '' ).split( path.sep );
    if( min ) {
      return Number( hourFolder ) >= Number( monthDayHour ) && Number( fileName ) >= Number( minSec );
    } else {
      return Number( hourFolder ) <= Number( monthDayHour ) && Number( fileName ) <= Number( minSec );
    }
  });
}

( async() => {

  const filesList = [];

  let error, dawn, dusk, files;

  [ error, dawn ] = await getTime( 'dawn', 'YYYY MM DD HH mmss' );
  [ error, dusk ] = await getTime( 'dusk', 'YYYY MM DD HH mmss' );

  const [ minYear, minMonth, minDay, minHour, minFileName ] = dawn.split(' ');
  const [ maxYear, maxMonth, maxDay, maxHour, maxFileName ] = dusk.split(' ');

  console.log( 'dawn', path.join( minYear, fixMonth( minMonth ) + minDay + minHour, minFileName ) );
  console.log( 'dusk', path.join( maxYear, fixMonth( maxMonth ) + maxDay + maxHour, maxFileName ) );

  [ error, files ] = await getFiles( fixMonth( minMonth ) + minDay + '**' + path.sep + '*.jpg', { cwd: path.join( process.env.webcamCache, process.env.cameraGUID, minYear ) })
  files = filterFiles( true, fixMonth( minMonth ) + minDay + minHour, minFileName, files );
  files.forEach( file => {
    filesList.push( path.join( process.env.webcamCache, process.env.cameraGUID, file ) );
  });

  [ error, files ] = await getFiles( fixMonth( maxMonth ) + maxDay + '**' + path.sep + '*.jpg', { cwd: path.join( process.env.webcamCache, process.env.cameraGUID, maxYear ) })
  files = filterFiles( false, fixMonth( maxMonth ) + maxDay + maxHour, maxFileName, files );
  files.forEach( file => {
    filesList.push( path.join( process.env.webcamCache, process.env.cameraGUID, file ) );
  });

  const txt = fs.createWriteStream( path.join( process.env.webcamCache, process.env.cameraGUID, maxYear, fixMonth( maxMonth ) + maxDay + '.txt' ) );
  filesList.sort().forEach( file => {
    txt.write( "file '" + file + "'\r\n" );
  });
  txt.close();

})();


const folder = path.join( process.env.webcamCache, process.env.cameraGUID, '2019' );

const globOptions = {
  cwd: [ ...folder.split( path.sep ) ].join( path.sep ),
}

// const txt = fs.createWriteStream( '/home/pcnate/Documents/0401.txt', 'utf8' );
// // fs.writeFileSync( '/home/pcnate/Documents/0401.txt' )
// glob( '0401**/*.jpg', globOptions, async( err, files ) => {
//   // console.log( files );

//   files.forEach( async file => {
//     txt.write( "file '" + path.join( folder, file ) + "'\r\n" );
//   });

//   txt.close();
// })

//  ffmpeg -y -r 1 -f concat -safe 0 -i 0401.txt -c:v libx264 -vf "fps=24,format=yuv420p" 0401.mp4


// fs.readdir( folder, ( err, files ) => {
//   if( err ) {
//     console.error( 'error reading', folder );
//     console.error( err );
//     return;
//   }

//   files.forEach( file => {
//     if( file.indexOf( '0401') === 0 ) {
//       console.log( file );
//     }
//   })

// })