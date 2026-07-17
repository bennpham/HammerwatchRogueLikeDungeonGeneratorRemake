package hammerwatchgen;

public class XMLFloat extends XMLObject {

    String name;
    float value;
    
    XMLFloat( String name, float value ) {
        
        this.name = name;
        this.value = value;
    }
    
    public void setValue( int newValue ) {
    
    value = newValue;
    }
    
    @Override
    public String getXML() {
        
        return String.format( "<float name=\"%s\">%f</float>", name, value );
    }
}
