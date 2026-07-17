package hammerwatchgen;

public class XMLInt extends XMLObject {

    String name;
    int value;
    
    XMLInt( String name, int value ) {
        
        this.name = name;
        this.value = value;
    }
    
    public void setValue( int newValue ) {
    
    value = newValue;
    }
    
    @Override
    public String getXML() {
        
        return String.format( "<int name=\"%s\">%d</int>", name, value );
    }
}
