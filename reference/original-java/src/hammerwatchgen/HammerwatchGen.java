package hammerwatchgen;

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.util.Calendar;

public class HammerwatchGen {

    public static void main(String[] args) {
        
        Parameters.init();
        Calendar date = Calendar.getInstance();
        long seed = date.getTimeInMillis();
        if( args.length > 0 ) {
            
            seed = Integer.parseInt(args[0]);
        }
        String path = Parameters.path;
        
        String toolPath = path.concat("/editor/LevelPacker.exe");
        
        
        
        Rand.seed( seed );
        String levelString = "";
        String levelName = "dungeon" + ( seed );
        String levelPath = path.concat( "/editor/" + levelName + "/levels/");
        String basePath = path.concat( "/editor/" + levelName + "/");
        
        File file = new File(levelPath);
        file.mkdirs();

        System.out.print( "Generating " + Parameters.levels + " levels...\n" );
        for( int i = 0; i < Parameters.levels; i++ ) {
            
            Level testLevel = new Level(i);
            if( testLevel.levelValid ) {
                
                writeToFile( levelPath + "level" +  i  + ".xml", testLevel.getXML() );
                levelString = levelString.concat("<level id=\"" + i + "\" res=\"levels/level" + i + ".xml\" name=\"lvl.floor?floor=" + i + "\" />\n" );
                System.out.print( "Level " + ( i + 1 ) + " complete\n" );
            }
            else
            {
                i = i - 1;
                System.out.print( "Level generation failed, retrying...\n" );
            }
            testLevel = null;
            Doodad.Clear();
            Item.Clear();
            Monster.Clear();
            ScriptNode.Clear();
            ObjectSet.Clear();
        }
        
        // create info.xml
        writeToFile( basePath + "info.xml", 
        "<info>\n" +
        "	<name>Dungeon #" + seed + "</name>\n" +
        "	<description></description>\n" +
        "	<lives>0</lives>\n" +
        "</info>" );
        
        // create levels.xml
        writeToFile( basePath + "levels.xml", 
        "<levels start=\"0\">\n" + 
	"<act name=\"lvl.act1\">\n" +
	levelString +
	"       </act>\n" +
        "</levels>" );        
        
        // pack level
        System.out.print( "Packing levels...\n" );
        String commands[] = { toolPath, path.concat( "/editor/" + levelName ) };
        try {
        Process p = Runtime.getRuntime().exec( commands );
        p.waitFor();
        } catch( Exception e ) {
            e.printStackTrace();
        }
        
        // move finish product to level folder
        file = new File( path.concat( "/editor/" + levelName + ".hwm" ) );
        file.renameTo( new File( path.concat( "/levels/" + levelName + ".hwm" ) ) );
        
        
        // cleanup
        if( Parameters.cleanupFiles == 1 ) {
            deleteFile( basePath + "levels.xml" );
            deleteFile( basePath + "info.xml" );
            for( int i = 0; i < Parameters.levels; i++ ) {

                deleteFile( levelPath + "level" + i + ".xml");
            }
            file = new File(levelPath);
            file.delete();
            file = new File(basePath);
            file.delete();
        }
    }
    
    public static void writeToFile( String filename, String content ) {
        
        try {
          File file = new File(filename);
          BufferedWriter output = new BufferedWriter(new FileWriter(file));
          output.write(content);
          output.close();
        } catch ( IOException e ) {
           System.out.print( "Unable to write file: " + filename + "\n" );
        }
    }
    
    public static void deleteFile( String filename ) {

        File file = new File(filename);
        file.delete();
    }    
}
