package hammerwatchgen;

public class XMLString extends XMLObject {

    String name;
    String value;
    
    XMLString( String name, String value ) {
        
        this.name = name;
        this.value = value;
    }
    
    public void setValue( String newString ) {
    
    value = newString;
    }
    
    @Override
    public String getXML() {
        
        return String.format( "<string name=\"%s\">%s</string>", name, value );
    }
}
