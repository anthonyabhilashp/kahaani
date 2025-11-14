#!/bin/bash

# Unified Font Setup for Local and Railway
#
# Downloads caption fonts to project directory
# Runs automatically on `npm install` via postinstall hook
# Works the same on local development and Railway deployment

set -e

FONTS_DIR="$(dirname "$0")/../fonts"
mkdir -p "$FONTS_DIR"

# Only download if fonts directory is empty
if [ "$(ls -A $FONTS_DIR 2>/dev/null)" ]; then
  echo "✅ Fonts already installed in $FONTS_DIR"
  exit 0
fi

echo "🔤 Setting up caption fonts..."

# Download popular fonts with multiple weights (quiet mode)
curl -sL https://github.com/google/fonts/raw/main/ofl/montserrat/Montserrat-Regular.ttf -o "$FONTS_DIR/Montserrat-Regular.ttf"
curl -sL https://github.com/google/fonts/raw/main/ofl/montserrat/Montserrat-Medium.ttf -o "$FONTS_DIR/Montserrat-Medium.ttf"
curl -sL https://github.com/google/fonts/raw/main/ofl/montserrat/Montserrat-SemiBold.ttf -o "$FONTS_DIR/Montserrat-SemiBold.ttf"
curl -sL https://github.com/google/fonts/raw/main/ofl/montserrat/Montserrat-Bold.ttf -o "$FONTS_DIR/Montserrat-Bold.ttf"

curl -sL https://github.com/google/fonts/raw/main/ofl/poppins/Poppins-Regular.ttf -o "$FONTS_DIR/Poppins-Regular.ttf"
curl -sL https://github.com/google/fonts/raw/main/ofl/poppins/Poppins-Medium.ttf -o "$FONTS_DIR/Poppins-Medium.ttf"
curl -sL https://github.com/google/fonts/raw/main/ofl/poppins/Poppins-SemiBold.ttf -o "$FONTS_DIR/Poppins-SemiBold.ttf"
curl -sL https://github.com/google/fonts/raw/main/ofl/poppins/Poppins-Bold.ttf -o "$FONTS_DIR/Poppins-Bold.ttf"

curl -sL https://github.com/google/fonts/raw/main/ofl/inter/Inter-Regular.ttf -o "$FONTS_DIR/Inter-Regular.ttf"
curl -sL https://github.com/google/fonts/raw/main/ofl/inter/Inter-Medium.ttf -o "$FONTS_DIR/Inter-Medium.ttf"
curl -sL https://github.com/google/fonts/raw/main/ofl/inter/Inter-SemiBold.ttf -o "$FONTS_DIR/Inter-SemiBold.ttf"
curl -sL https://github.com/google/fonts/raw/main/ofl/inter/Inter-Bold.ttf -o "$FONTS_DIR/Inter-Bold.ttf"

curl -sL https://github.com/google/fonts/raw/main/apache/roboto/Roboto-Regular.ttf -o "$FONTS_DIR/Roboto-Regular.ttf"
curl -sL https://github.com/google/fonts/raw/main/apache/roboto/Roboto-Medium.ttf -o "$FONTS_DIR/Roboto-Medium.ttf"
curl -sL https://github.com/google/fonts/raw/main/apache/roboto/Roboto-Bold.ttf -o "$FONTS_DIR/Roboto-Bold.ttf"

curl -sL https://github.com/google/fonts/raw/main/apache/opensans/OpenSans-Regular.ttf -o "$FONTS_DIR/OpenSans-Regular.ttf"
curl -sL https://github.com/google/fonts/raw/main/apache/opensans/OpenSans-Medium.ttf -o "$FONTS_DIR/OpenSans-Medium.ttf"
curl -sL https://github.com/google/fonts/raw/main/apache/opensans/OpenSans-SemiBold.ttf -o "$FONTS_DIR/OpenSans-SemiBold.ttf"
curl -sL https://github.com/google/fonts/raw/main/apache/opensans/OpenSans-Bold.ttf -o "$FONTS_DIR/OpenSans-Bold.ttf"

# Other fonts
curl -sL https://github.com/google/fonts/raw/main/ofl/lato/Lato-Regular.ttf -o "$FONTS_DIR/Lato-Regular.ttf"
curl -sL https://github.com/google/fonts/raw/main/ofl/lato/Lato-Bold.ttf -o "$FONTS_DIR/Lato-Bold.ttf"
curl -sL https://github.com/google/fonts/raw/main/ofl/raleway/Raleway-Regular.ttf -o "$FONTS_DIR/Raleway-Regular.ttf"
curl -sL https://github.com/google/fonts/raw/main/ofl/raleway/Raleway-Bold.ttf -o "$FONTS_DIR/Raleway-Bold.ttf"
curl -sL https://github.com/google/fonts/raw/main/ofl/nunito/Nunito-Regular.ttf -o "$FONTS_DIR/Nunito-Regular.ttf"
curl -sL https://github.com/google/fonts/raw/main/ofl/nunito/Nunito-Bold.ttf -o "$FONTS_DIR/Nunito-Bold.ttf"
curl -sL https://github.com/google/fonts/raw/main/ofl/sourcesanspro/SourceSansPro-Regular.ttf -o "$FONTS_DIR/SourceSansPro-Regular.ttf"
curl -sL https://github.com/google/fonts/raw/main/ofl/sourcesanspro/SourceSansPro-Bold.ttf -o "$FONTS_DIR/SourceSansPro-Bold.ttf"
curl -sL https://github.com/google/fonts/raw/main/ofl/oswald/Oswald-Regular.ttf -o "$FONTS_DIR/Oswald-Regular.ttf"
curl -sL https://github.com/google/fonts/raw/main/ofl/oswald/Oswald-Bold.ttf -o "$FONTS_DIR/Oswald-Bold.ttf"
curl -sL https://github.com/google/fonts/raw/main/ofl/bebasneue/BebasNeue-Regular.ttf -o "$FONTS_DIR/BebasNeue-Regular.ttf"

# Serif
curl -sL https://github.com/google/fonts/raw/main/ofl/playfairdisplay/PlayfairDisplay-Regular.ttf -o "$FONTS_DIR/PlayfairDisplay-Regular.ttf"
curl -sL https://github.com/google/fonts/raw/main/ofl/playfairdisplay/PlayfairDisplay-Bold.ttf -o "$FONTS_DIR/PlayfairDisplay-Bold.ttf"
curl -sL https://github.com/google/fonts/raw/main/ofl/merriweather/Merriweather-Regular.ttf -o "$FONTS_DIR/Merriweather-Regular.ttf"
curl -sL https://github.com/google/fonts/raw/main/ofl/merriweather/Merriweather-Bold.ttf -o "$FONTS_DIR/Merriweather-Bold.ttf"
curl -sL https://github.com/google/fonts/raw/main/ofl/lora/Lora-Regular.ttf -o "$FONTS_DIR/Lora-Regular.ttf"
curl -sL https://github.com/google/fonts/raw/main/ofl/lora/Lora-Bold.ttf -o "$FONTS_DIR/Lora-Bold.ttf"
curl -sL https://github.com/google/fonts/raw/main/ofl/ptserif/PTSerif-Regular.ttf -o "$FONTS_DIR/PTSerif-Regular.ttf"
curl -sL https://github.com/google/fonts/raw/main/ofl/ptserif/PTSerif-Bold.ttf -o "$FONTS_DIR/PTSerif-Bold.ttf"

# Display
curl -sL https://github.com/google/fonts/raw/main/ofl/bangers/Bangers-Regular.ttf -o "$FONTS_DIR/Bangers-Regular.ttf"
curl -sL https://github.com/google/fonts/raw/main/ofl/pacifico/Pacifico-Regular.ttf -o "$FONTS_DIR/Pacifico-Regular.ttf"
curl -sL https://github.com/google/fonts/raw/main/ofl/righteous/Righteous-Regular.ttf -o "$FONTS_DIR/Righteous-Regular.ttf"
curl -sL https://github.com/google/fonts/raw/main/ofl/lobster/Lobster-Regular.ttf -o "$FONTS_DIR/Lobster-Regular.ttf"
curl -sL https://github.com/google/fonts/raw/main/apache/permanentmarker/PermanentMarker-Regular.ttf -o "$FONTS_DIR/PermanentMarker-Regular.ttf"
curl -sL https://github.com/google/fonts/raw/main/ofl/dancingscript/DancingScript-Regular.ttf -o "$FONTS_DIR/DancingScript-Regular.ttf"
curl -sL https://github.com/google/fonts/raw/main/ofl/dancingscript/DancingScript-Bold.ttf -o "$FONTS_DIR/DancingScript-Bold.ttf"

# Monospace
curl -sL https://github.com/google/fonts/raw/main/apache/robotomono/RobotoMono-Regular.ttf -o "$FONTS_DIR/RobotoMono-Regular.ttf"
curl -sL https://github.com/google/fonts/raw/main/apache/robotomono/RobotoMono-Bold.ttf -o "$FONTS_DIR/RobotoMono-Bold.ttf"
curl -sL https://github.com/google/fonts/raw/main/ofl/sourcecodepro/SourceCodePro-Regular.ttf -o "$FONTS_DIR/SourceCodePro-Regular.ttf"
curl -sL https://github.com/google/fonts/raw/main/ofl/sourcecodepro/SourceCodePro-Bold.ttf -o "$FONTS_DIR/SourceCodePro-Bold.ttf"

echo "✅ Fonts installed to $FONTS_DIR"
