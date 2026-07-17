package hammerwatchgen;

import java.util.ArrayList;

public class XMLArray extends XMLObject {

    String name;
    ArrayList<XMLObject> dataList;
    
    XMLArray( String name ) {
        
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
        
        String xmlString =  String.format( "<array name=\"%s\">", name );
        for( XMLObject d : dataList ) {
            xmlString = xmlString.concat( String.format( "%s", d.getXML() ) );
        }
        return xmlString.concat( "</array>");
    }
}