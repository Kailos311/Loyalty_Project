import React from 'react';

function Logo(props) {
  return (
    <img
      alt="Logo"
      src="/static/logo.jpg"
      width="60px"
      height="60px"
      {...props}
      display="none"
    />
  );
}

export default Logo;
