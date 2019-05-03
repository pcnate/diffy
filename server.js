require('dotenv').config();
const path = require('path');
const fs = require('fs');
const glob = require('glob');
const moment = require('moment');
const suncalc = require('suncalc');
const { spawn } = require('child_process');

/**
 * get the suncalc times
 */
function getTimes() {
  return new Promise( async resolve => {
    try {
      const dt = new Date();
      dt.setHours( dt.getHours() + Number( process.env.hoursOffset || 0 ) )
      resolve([ false, suncalc.getTimes( dt, process.env.latitude, process.env.longitude ) ]);
    } catch( error ) {
      resolve([ error, {} ]);
    }
  });
}

/**
 * get the time and format it
 *
 * @param {string} timeKey dusk|dawn|etc
 * @param {string} format momentjs format
 */
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

/**
 * get the list of files that match the glob pattern and options
 *
 * @param {string} pattern glob pattern
 * @param {object} options glob options
 */
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

/**
 * subtract 1 from the month to batch the images that are off by 1 month
 *
 * @param {number} month
 */
function fixMonth( month ) {
  return ( Number( month ) - 1 ).toString().padStart( 2, '0' )
}

/**
 * filter the list to only include images taken between the start and end time
 *
 * @param {boolean} min whether this is the minimum or the maximum date
 * @param {number} monthDayHour date in MMDDHH
 * @param {number} minSec date in mmss
 * @param {array} files array of files to filter down
 */
function filterFiles( minMonthDayHour, maxMonthDayHour, minMinuteSecond, maxMinuteSecond, files ) {
  minMonthDayHour = Number( minMonthDayHour );
  maxMonthDayHour = Number( maxMonthDayHour );
  minMinuteSecond = Math.floor( Number( minMinuteSecond ) / 100 ) * 100;
  maxMinuteSecond = Math.floor( Number( maxMinuteSecond ) / 100 ) * 100 + 100;

  return files.filter( x => {
    const [ yearFolder, hourFolder, fileName ] = x.replace('.jpg', '' ).split( path.sep );

    if( Number( hourFolder ) > minMonthDayHour && Number( hourFolder ) < maxMonthDayHour ) {
      return true;
    } else
    if( Number ( hourFolder ) === minMonthDayHour && Number( fileName ) >= minMinuteSecond ) {
      return true;
    }
    if( Number ( hourFolder ) === maxMonthDayHour && Number( fileName ) <= maxMinuteSecond ) {
      return true;
    }

    return false;
  });
}

/**
 * generate the mp4 video
 */
function makemp4( movPath, listPath ) {
  return new Promise( async ( resolve, reject ) => {

    // try {
    //   ffmpeg( listPath )
    //     .inputOption(['-f concat'])
    //     .videoCodec('libx264')
    //     .outputFormat('mp4')
    //     .on( 'error', reject )
    //     .on( 'done', resolve )
    //     .on( 'end', resolve )
    //     .save( movPath );
    // } catch( error ) {
    //   console.error( error );
    //   reject( error );
    // }

    const cmd = process.env.ffmpegpath || 'ffmpeg';

    const args = [
      '-y',
      '-r', '10',
      '-f', 'concat',
      '-safe', '0',
      '-i', listPath,
      '-c:v', 'libx264',
      // '-vf', '"format=yuv420p"',
      movPath
    ]

    const proc = spawn( cmd, args );

    proc.stdout.on('data', data => {
      console.log( data.toString() );
    })
    proc.stderr.on('data', data => {
      console.log( data.toString() );
    })

    proc.on('close', () => {
      resolve();
    })

  });
}
// this worked
//  ffmpeg -y -r 1 -f concat -safe 0 -i 0401.txt -c:v libx264 -vf "fps=24,format=yuv420p" 0401.mp4


( async() => {

  let filesList = [];

  let error, dawn, dusk, files;

  [ error, dawn ] = await getTime( 'dawn', 'YYYY MM DD HH mmss' );
  [ error, dusk ] = await getTime( 'dusk', 'YYYY MM DD HH mmss' );

  const [ minYear, minMonth, minDay, minHour, minFileName ] = dawn.split(' ');
  const [ maxYear, maxMonth, maxDay, maxHour, maxFileName ] = dusk.split(' ');

  console.log( 'dawn', path.join( minYear, fixMonth( minMonth ) + minDay + minHour, minFileName ) );
  console.log( 'dusk', path.join( maxYear, fixMonth( maxMonth ) + maxDay + maxHour, maxFileName ) );

  [ error, files ] = await getFiles( fixMonth( minMonth ) + minDay + '**' + path.sep + '*.jpg', { cwd: path.join( process.env.webcamCache, process.env.cameraGUID, minYear ) })
  files.forEach( file => {
    filesList.push( path.join( minYear, file ) );
  });
  
  [ error, files ] = await getFiles( fixMonth( maxMonth ) + maxDay + '**' + path.sep + '*.jpg', { cwd: path.join( process.env.webcamCache, process.env.cameraGUID, maxYear ) })
  files.forEach( file => {
    filesList.push( path.join( maxYear, file ) );
  });

  filesList = filterFiles( fixMonth( minMonth ) + minDay + minHour, fixMonth( maxMonth ) + maxDay + maxHour, minFileName, maxFileName, filesList );

  console.log( 'total files', filesList.length );

  const listPath = path.join( process.env.webcamCache, process.env.cameraGUID, maxYear, 'temp', fixMonth( maxMonth ) + maxDay + '.txt' );
  const movPath = path.join( process.env.webcamCache, process.env.cameraGUID, maxYear, 'temp', fixMonth( maxMonth ) + maxDay + '.mp4' );

  const txt = fs.createWriteStream( listPath );
  filesList.sort().forEach( file => {
    txt.write( "file '" + path.join( process.env.webcamCache, process.env.cameraGUID, file ) + "'\r\n" );
  });
  txt.close();

  await makemp4( movPath, listPath )

  console.log( 'done' );

})();
