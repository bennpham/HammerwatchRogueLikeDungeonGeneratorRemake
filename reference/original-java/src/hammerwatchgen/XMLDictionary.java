package hammerwatchgen;

import java.util.ArrayList;

public class XMLDictionary extends XMLObject {

    String name;
    ArrayList<XMLObject> dataList;
    
    XMLDictionary( String name ) {
        
        this.name = name;
        dataList = new ArrayList<>();
    }
    
    public void addData( XMLObject object ) {
        
        dataList.add(object);
    }
    
    public void clearData() {
    
        dataList.clear();
    }
    
    @Override
    public String getXML() {
        
        String xmlString =  String.format( "<dictionary" );
        if( name != null && !name.isEmpty() ) {
            xmlString = xmlString.concat( String.format( " name=\"%s\"", name ) );
        }
        xmlString = xmlString.concat( ">\n" );
        for( XMLObject d : dataList ) {
            xmlString = xmlString.concat( String.format( "%s\n", d.getXML() ) );
        }
        return xmlString.concat( "</dictionary>\n");
    }
}
