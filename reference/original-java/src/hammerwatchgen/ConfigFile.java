package hammerwatchgen;

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.util.ArrayList;

public class ConfigFile {

    private class Param {
        
        String name;
        String value;
    }
    
    String filename;
    ArrayList<Param> data;
    
    ConfigFile( String filename ) {
        
        data = new ArrayList<>();
        this.filename = filename;
        
        // open file if exists and parse
        File file = new File( filename );
        if( file.exists() ) {
            
            FileReader reader;
            String fileContents = "";
            try {
                reader = new FileReader( file );
                char[] cbuf = new char[100];
                int count = 1;
                while( count > 0 ) {
                    count = reader.read( cbuf );
                    if( count > 0 )
                        fileContents = fileContents.concat( String.valueOf(cbuf) );
                }
                reader.close();
                
                } catch( Exception e ) {
                    e.printStackTrace();
                }
            
            // parse
            String[] lines = fileContents.split("\n");
            for( String line : lines ) {
                
                String trimmedLine = line.trim();
                String[] parts = trimmedLine.split("=");
                if( parts.length == 2 ) {
                    
                    Param p = new Param();
                    p.name = parts[0];
                    p.value = parts[1];
                    data.add(p);
                }
            }
        }
    }
    
    private int getItemIndex( String name, String def ) {
        
        for( int i = 0; i < data.size(); i++ ) {
                    
            if( data.get(i).name.equals( name ) ) {
                
                return i;
            }
        }
        Param p = new Param();
        p.name = name;
        p.value = def;
        data.add(p);
        return data.size() - 1;
    }
    
    public int getInt( String name, int def ) {
        
        int index = getItemIndex( name, String.format("%d", def));
        return Integer.parseInt( data.get(index).value );
    }

    public String getString( String name, String def ) {
        
        int index = getItemIndex( name, def );
        return data.get(index).value;
    }    

    public float getFloat( String name, float def ) {
        
        int index = getItemIndex( name, String.format("%f", def));
        return Float.parseFloat(data.get(index).value );
    }    
    
    public String[] getStringArray( String name, String[] def ) {
        
        String outString = "";
        for( String s : def ) {
            
            outString = outString.concat( s + ",");
        }
        outString = outString.substring(0, outString.length() - 1 );
        
        int index = getItemIndex( name, outString );
        
        return data.get(index).value.split(",");
    }
    
    public void save() {
        
        // build output text
        
        String outputText = "";
        
        for( Param p : data ) {
            
            outputText = outputText.concat( p.name + "=" + p.value + "\r\n" );
        }
        
        try {
          File file = new File(filename);
          BufferedWriter output = new BufferedWriter(new FileWriter(file));
          output.write(outputText);
          output.close();
        } catch ( IOException e ) {
           System.out.print( e.toString() );
        }
    }
    
}
