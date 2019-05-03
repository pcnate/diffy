const path = require('path');
const fs = require('fs');
const glob = require('glob');
const os = require('os');


const folder = '/media/raid5/webcamCache/09ae05c5-64d4-4f5d-8557-9ac62fb74a7e/2019';

const globOptions = {
  cwd: [ ...folder.split('/') ].join( path.sep ),
}

const txt = fs.createWriteStream( '/home/pcnate/Documents/0401.txt', 'utf8' );
// fs.writeFileSync( '/home/pcnate/Documents/0401.txt' )
glob( '0401**/*.jpg', globOptions, async( err, files ) => {
  // console.log( files );

  files.forEach( async file => {
    txt.write( "file '" + path.join( folder, file ) + "'\r\n" );
  });

  txt.close();
})

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