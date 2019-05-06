require('dotenv').config();
const path = require('path');
const os = require('os');
const fs = require('fs-extra');
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

      if ( fs.exists( options.cwd ) ) {

        glob( pattern, options, async ( err, files ) => {
          resolve([ err, files ])
        })

      } else {
        resolve([ false, [] ]);
      }

    } catch( error ) {
      resolve([ error, [] ]);
    }
  });
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

    // this worked
    //  ffmpeg -y -r 1 -f concat -safe 0 -i 0401.txt -c:v libx264 -vf "fps=24,format=yuv420p" 0401.mp4
    const args = [
      '-y',
      '-r', process.env.framerate || 10,
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


/**
 * find all image files for a camera and generate the video
 *
 * @param {string} cameraGUID
 * @param {string} dawn timestamp in `YYYY MM DD HH mmss`
 * @param {string} dusk timestamp in `YYYY MM DD HH mmss`
 */
function processCamera( cameraGUID = '', dawn = '', dusk = '' ) {
  return new Promise( async resolve => {

    if( cameraGUID === '' || dawn === '' || dusk === '' ) {
      resolve( false );
      return;
    }

    console.log( 'processing camera', cameraGUID );

    let filesList = [];

    let error, files;

    const [ minYear, minMonth, minDay, minHour, minFileName ] = dawn.split(' ');
    const [ maxYear, maxMonth, maxDay, maxHour, maxFileName ] = dusk.split(' ');

    [ error, files ] = await getFiles( minMonth + minDay + '**' + path.sep + '*.jpg', { cwd: path.join( process.env.webcamCache, cameraGUID, minYear ) })
    files.forEach( file => {
      filesList.push( path.join( minYear, file ) );
    });
    
    [ error, files ] = await getFiles( maxMonth + maxDay + '**' + path.sep + '*.jpg', { cwd: path.join( process.env.webcamCache, cameraGUID, maxYear ) })
    files.forEach( file => {
      filesList.push( path.join( maxYear, file ) );
    });

    filesList = filterFiles( minMonth + minDay + minHour, maxMonth + maxDay + maxHour, minFileName, maxFileName, filesList );

    console.log( 'total files', filesList.length );

    await fs.ensureDir( path.join( process.env.webcamCache, cameraGUID, minYear, 'temp' ) );

    const listPath = path.join( process.env.webcamCache, cameraGUID, minYear, 'temp', minMonth + minDay + '.txt' );
    const movPath  = path.join( process.env.webcamCache, cameraGUID, minYear, 'temp', minMonth + minDay + '.mp4' );

    if( filesList.length < 1 ) {
      console.log( 'no files' );
      resolve( false );
      return;
    }

    try {

      const txt = fs.createWriteStream( listPath );
      filesList.sort().forEach( file => {
        txt.write( "file '" + path.join( process.env.webcamCache, cameraGUID, file ) + "'" + os.EOL );
      });
      txt.close();

      await makemp4( movPath, listPath )

      await removeListFile( listPath );

      resolve( true );

    } catch ( processingError ) {

      await removeListFile( listPath );
      
      console.error( 'error processing input or output files', os.EOL, processingError );

      resolve( false );
    }

  });
}

function removeListFile( listPath ) {
  return new Promise( async resolve => {

    if( await fs.exists( listPath ) ) {
      await fs.unlink( listPath );
    }

    resolve();

  });
}

( async() => {

  let error = false, dawn = '', dusk = '';

  [ error, dawn ] = await getTime( 'dawn', 'YYYY MM DD HH mmss' );
  [ error, dusk ] = await getTime( 'dusk', 'YYYY MM DD HH mmss' );

  const [ minYear, minMonth, minDay, minHour, minFileName ] = dawn.split(' ');
  const [ maxYear, maxMonth, maxDay, maxHour, maxFileName ] = dusk.split(' ');

  console.log( 'dawn', path.join( minYear, minMonth + minDay + minHour, minFileName ) );
  console.log( 'dusk', path.join( maxYear, maxMonth + maxDay + maxHour, maxFileName ) );

  const cameraGUIDs = ( process.env.cameraGUIDs || '' ).split(',')

  for( cameraGUID of cameraGUIDs ) {
    await processCamera( cameraGUID, dawn, dusk );
  }

  console.log('done');

})();