package hammerwatchgen;

public class XMLIntArray extends XMLObject {

    String name;
    int[] data;
    
    XMLIntArray( String name, int[] data ) {
        
        this.name = name;
        this.data = data.clone();
    }
    
    public void setData( int[] data ) {
    
    this.data = data.clone();
    }
    
    @Override
    public String getXML() {
        
        String xmlString =  String.format( "<int-arr name=\"%s\">", name );
        for( int d : data ) {
            xmlString = xmlString.concat( String.format( "%d ", d ) );
        }
        xmlString = xmlString.substring(0, xmlString.length() - 1);
        return xmlString.concat( "</int-arr>");
    }
}
